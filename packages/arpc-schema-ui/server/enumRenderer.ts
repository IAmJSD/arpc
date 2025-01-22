import type { Enum } from "@arpc-packages/client-gen";
import titleRenderer from "./titleRenderer";
import typeRenderer from "./typeRenderer";
import { sanitize } from "./utils";

export default (enum_: Enum) => {
    return /* html */`<section>${titleRenderer(enum_.name, 3)}
    <p>The type of values in this enum is <code>${sanitize(typeRenderer(enum_.valueType))}</code>.</p>
    <ul class="list-disc">
        ${new Array(enum_.data.entries()).map(([key, value]) => /* html */`<li><code>${sanitize(String(key))}</code>: <code>${sanitize(String(value))}</code></li>`).join("")}
    </ul>
</section>`;
};
