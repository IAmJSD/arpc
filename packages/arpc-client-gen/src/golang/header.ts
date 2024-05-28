export default `// This file was auto-generated by arpc. Do not edit this file.

package client

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/url"
	"unsafe"

	"github.com/vmihailenco/msgpack/v5"
)

// Defines the base that all clients will call.
type clientBase struct {
	c       *http.Client
	url     string
	headers map[string]string
}

// BatchError is a batch of errors that can be returned from a batch request.
type BatchError struct {
	// Errors is a list of errors that were returned from the batch request.
	Errors []error
}

// Error implements the error interface.
func (b BatchError) Error() string {
	e := ""
	for i, err := range b.Errors {
		if i != 0 {
			e += ", "
		}
		e += err.Error()
	}
	return e
}

// Defines the error response body.
type errorResponse struct {
	BuiltIn bool               \`msgpack:"builtIn"\`
	Name    string             \`msgpack:"name"\`
	Code    string             \`msgpack:"code,omitempty"\`
	Message string             \`msgpack:"message"\`
	Body    msgpack.RawMessage \`msgpack:"body,omitempty"\`
}

// BaseError is the base error that all errors will implement.
type BaseError struct{}

// Error implements the error interface.
func (b BaseError) Error() string {
	return "arpc error"
}

// InvalidResponse is an error that is returned when the response is not what
// is expected from this protocol.
type InvalidResponse struct {
	BaseError

	Code    string \`json:"code"\`
	Message string \`json:"message"\`
}

// Error implements the error interface.
func (i InvalidResponse) Error() string {
	return i.Message
}

// UnknownError is an error that is returned when the error is not known.
type UnknownError struct {
	BaseError

	Name    string             \`json:"name"\`
	Code    string             \`json:"code"\`
	Message string             \`json:"message"\`
	Body    msgpack.RawMessage \`json:"-"\`
}

// Error implements the error interface.
func (u UnknownError) Error() string {
	msg := "unknown exception (" + u.Name + ")"
	if u.Message != "" {
		msg += ": " + u.Message
	}
	return msg
}

var builtInErrors = map[string]func(
	code, message string, body msgpack.RawMessage,
) error{
	"InvalidResponse": func(code, message string, _ msgpack.RawMessage) error {
		return InvalidResponse{
			Code:    code,
			Message: message,
		}
	},
}

var customErrors = map[string]func(msgpack.RawMessage) error{}

// Used when there isn't a body all around the place.
var msgpackNull = []byte{0xc0}

// Processes an error response and turns it into an error.
func processError(e errorResponse) error {
	body := e.Body
	if body == nil {
		body = msgpackNull
	}

	if e.BuiltIn {
		if f, ok := builtInErrors[e.Name]; ok {
			return f(e.Code, e.Message, body)
		}
		return UnknownError{
			Name:    e.Name,
			Code:    e.Code,
			Message: e.Message,
			Body:    body,
		}
	}

	if f, ok := customErrors[e.Name]; ok {
		return f(body)
	}
	return UnknownError{
		Name: e.Name,
		Body: body,
	}
}

// Defines the request that will be sent to the server.
type request struct {
	method   string
	arg      any
	mutation bool
	mutator  func([]byte) (any, error)
}

// The main function to perform the network request.
func (c *clientBase) do(ctx context.Context, req any) (any, error) {
	urlCpy := c.url

	var body any
	reqType := "POST"
	switch r := req.(type) {
	case request:
		if !r.mutation {
			reqType = "GET"
		}
		body = r.arg
		urlCpy += "&route=" + r.method
	case []*request:
		allNonMutators := true
		type batchItem struct {
			MethodName string \`msgpack:"methodName"\`
			Arg        any    \`msgpack:"arg"\`
		}
		a := make([]batchItem, len(r))
		for i, req := range r {
			if req.mutation {
				allNonMutators = false
			}
			a[i] = batchItem{
				MethodName: req.method,
				Arg:        req.arg,
			}
		}
		if allNonMutators {
			reqType = "GET"
		}
		body = a
		urlCpy += "&route=batch"
	default:
		panic("unknown request type")
	}

	reqBody, err := msgpack.Marshal(body)
	if err != nil {
		return nil, err
	}
	var reader io.Reader
	if reqType == "GET" {
		esc := url.QueryEscape(unsafe.String(&reqBody[0], len(reqBody)))
		urlCpy += "&arg=" + esc
	} else {
		reader = bytes.NewReader(reqBody)
	}

	httpReq, err := http.NewRequestWithContext(ctx, reqType, urlCpy, reader)
	if err != nil {
		return nil, err
	}
	if reqType == "POST" {
		httpReq.Header.Set("Content-Type", "application/x-msgpack")
	}
	for k, v := range c.headers {
		httpReq.Header.Set(k, v)
	}

	httpResp, err := c.c.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer httpResp.Body.Close()

	if httpReq.Header.Get("x-is-arpc") != "true" {
		return nil, processError(errorResponse{
			BuiltIn: true,
			Name:    "InvalidResponse",
			Code:    "INVALID_RESPONSE",
			Message: "The response is not an arpc response.",
			Body:    msgpackNull,
		})
	}

	if httpResp.StatusCode == http.StatusNoContent {
		switch r := req.(type) {
		case request:
			return r.mutator(msgpackNull)
		case []*request:
			a := make([]any, len(r))
			for i, req := range r {
				a[i], err = req.mutator(msgpackNull)
				if err != nil {
					return nil, err
				}
			}
			return a, nil
		default:
			panic("unknown request type")
		}
	}

	bodyData, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, err
	}

	if httpResp.StatusCode == http.StatusOK {
		switch r := req.(type) {
		case request:
			return r.mutator(bodyData)
		case []*request:
			var raws []msgpack.RawMessage
			err = msgpack.Unmarshal(bodyData, &raws)
			if err != nil {
				return nil, err
			}
			a := make([]any, len(r))
			for i, raw := range raws {
				a[i], err = r[i].mutator(raw)
				if err != nil {
					return nil, err
				}
			}
			return a, nil
		default:
			panic("unknown request type")
		}
	}

	var errs []errorResponse
	err = msgpack.Unmarshal(bodyData, &errs)
	if err != nil {
		var single errorResponse
		err = msgpack.Unmarshal(bodyData, &single)
		if err != nil {
			return nil, err
		}
		return nil, processError(single)
	}
	errsIface := make([]error, len(errs))
	for i, e := range errs {
		errsIface[i] = processError(e)
	}
	return nil, BatchError{Errors: errsIface}
}`;
