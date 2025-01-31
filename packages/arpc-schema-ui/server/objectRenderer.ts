import type { Object } from "@arpc-packages/client-gen";
import titleRenderer from "./titleRenderer";
import typeRenderer from "./typeRenderer";
import { sanitize } from "./utils";

export default (obj: Object) => {
    const orderedKeys = Object.entries(obj.fields).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

    return /* html */`<section>${titleRenderer(obj.name, 3, false)}
    ${orderedKeys.length === 0 ? "<p>There are no fields in this object.</p>" : ""}
    <ul class="list-disc list-inside">
        ${orderedKeys.map(([key, field]) => /* html */`<li><code>${sanitize(key)}</code>: <code>${sanitize(typeRenderer(field))}</code></li>`).join("")}
    </ul>
</section>`;
}
