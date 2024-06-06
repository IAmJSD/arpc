"use client";

import React from "react";
import type * as ClientGenImport from "@arpc-packages/client-gen";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGolang, faNode, faPhp, faPython } from "@fortawesome/free-brands-svg-icons";
import { faClipboard, faDownload, faPlus } from "@fortawesome/free-solid-svg-icons";
import { Button } from "./Button";
import { Modal } from "./Modal";

type Props = {
    pkg: typeof ClientGenImport;
    buildData: ClientGenImport.BuildData;
};

type CheckboxProps = {
    title: string;
    checked: boolean;
    change: (value: boolean) => void;
};

function Checkbox({ title, checked, change }: CheckboxProps) {
    return (
        <form onSubmit={(e) => e.preventDefault()} className="ml-2 my-4">
            <label className="flex items-center">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => change(e.target.checked)}
                    className="mr-2"
                />
                {title}
            </label>
        </form>
    );
}

function download(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function CodeResult({ code, ext }: { code: string; ext: string }) {
    return (
        <div className="flex">
            <Button
                onClick={() => {
                    navigator.clipboard.writeText(code);
                }}
                styles="regular"
            >
                <FontAwesomeIcon icon={faClipboard} className="mr-2" />
                Copy to Clipboard
            </Button>

            <Button
                onClick={() => {
                    download(`client.${ext}`, code);
                }}
                styles="regular"
            >
                <FontAwesomeIcon icon={faDownload} className="mr-2" />
                Download Client
            </Button>
        </div>
    )
}

type LanguageProps<T> = {
    generate: T;
    close: () => void;
};

function Python({ generate, close }: LanguageProps<(async: boolean) => string>) {
    const [code, setCode] = React.useState(() => generate(false));
    const [async, setAsync] = React.useState(false);

    return (
        <Modal close={close} title="Generate Python Code">
            <Checkbox
                title="Make the Python code use async functions"
                checked={async}
                change={(async) => {
                    setAsync(async);
                    setCode(generate(async));
                }}
            />

            <CodeResult code={code} ext="py" />
        </Modal>
    );
}

type SingletonProps = {
    code: string;
    close: () => void;
    name: string;
    ext: string;
};

function Singleton({ code, close, name, ext }: SingletonProps) {
    return (
        <Modal close={close} title={`Generate ${name} Code`}>
            <CodeResult code={code} ext={ext} />
        </Modal>
    );
}

type InputProps = {
    title: string;
    value: string;
    change: (value: string) => void;
    required?: boolean;
};

function Input({ title, value, change, required }: InputProps) {
    const inputId = React.useId();

    return (
        <form onSubmit={(e) => e.preventDefault()} className="my-4">
            <label htmlFor={inputId}>
                {title}:
            </label>

            <input
                id={inputId}
                type="text"
                value={value}
                onChange={(e) => change(e.target.value)}
                required={required}
                placeholder={title}
                className="mt-2 w-full rounded-md p-2 dark:bg-neutral-800"
            />
        </form>
    );
}

function PHP({ generate, close }: LanguageProps<(namespace: string) => string>) {
    const [code, setCode] = React.useState(null as string | null);
    const [namespace, setNamespace] = React.useState("");

    if (code) {
        return (
            <Modal close={close} title="Generated PHP Code">
                <CodeResult code={code} ext="php" />
            </Modal>
        );
    }

    return (
        <Modal close={close} title="Generate PHP Code">
            <Input
                title="Namespace"
                value={namespace}
                change={(value) => setNamespace(value)}
                required={true}
            />

            <div className="flex">
                <Button
                    onClick={() => setCode(generate(namespace))}
                    styles="regular"
                    disabled={!namespace}
                >
                    <FontAwesomeIcon icon={faPlus} className="mr-2" />
                    Generate PHP Code
                </Button>
            </div>
        </Modal>
    );
}

export function ClientButtons({ pkg, buildData }: Props) {
    const [activeButton, setActiveButton] = React.useState<React.ReactNode | null>(null);
    const close = () => setActiveButton(null);

    return (
        <div className="flex mt-3 flex-wrap">
            {activeButton}

            <Button
                onClick={() => setActiveButton(<Singleton
                    code={pkg.typescript(buildData)}
                    close={close}
                    name="TypeScript"
                    ext="ts"
                />)}
                styles="regular"
            >
                <FontAwesomeIcon icon={faNode} className="mr-1" /> TypeScript
            </Button>

            <Button
                onClick={() => setActiveButton(<Python generate={(async) => {
                    const gen = async ? pkg.pythonAsync : pkg.pythonSync;
                    return gen(buildData);
                }} close={close} />)}
                styles="regular"
            >
                <FontAwesomeIcon icon={faPython} className="mr-1" /> Python
            </Button>

            <Button
                onClick={() => setActiveButton(<PHP
                    close={close}
                    generate={(ns) => pkg.php(buildData, { namespace: ns })}
                />)}
                styles="regular"
            >
                <FontAwesomeIcon icon={faPhp} className="mr-1" /> PHP
            </Button>

            <Button
                onClick={() => setActiveButton(<Singleton
                    code={pkg.golang(buildData)}
                    close={close}
                    name="Go"
                    ext="go"
                />)}
                styles="regular"
            >
                <FontAwesomeIcon icon={faGolang} className="mr-1" /> Go
            </Button>
        </div>
    );
}
