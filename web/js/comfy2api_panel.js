import { app } from "../../scripts/app.js";

const OUTPUT_NODE = /(save|output|video.?combine)/i;
const LINK_VALUE = (value) => Array.isArray(value) && value.length === 2 &&
    (typeof value[0] === "string" || typeof value[0] === "number") && Number.isInteger(value[1]);

const UI_TYPES = ["text", "slider", "number", "seed", "dropdown", "image"];

export function createComfy2ApiPanel() {
    const root = document.createElement("div");
    root.className = "c2a-panel";
    root.innerHTML = `
        <div class="c2a-header">
            <strong>Comfy2API Configurator</strong>
            <span>Create a monospace Space setup from the active workflow.</span>
        </div>
        <div class="c2a-scroll">
            <section class="c2a-section">
                <h3>Space</h3>
                <label class="c2a-label">Space name / slug<input class="c2a-input" data-field="name" placeholder="z-image-turbo"></label>
                <div class="c2a-grid">
                    <label class="c2a-label">Output type<select class="c2a-input" data-field="output_type"><option value="image">Image</option><option value="video">Video</option></select></label>
                    <label class="c2a-label">ZeroGPU duration (seconds)<input class="c2a-input" data-field="zerogpu_duration" type="number" min="1" max="300" value="60"></label>
                </div>
                <label class="c2a-label">Output node<select class="c2a-input" data-field="output_node_id"><option value="">Refresh workflow first</option></select></label>
                <button class="c2a-button" data-action="refresh">Read active workflow</button>
                <div class="c2a-note" data-role="workflow-status">The workflow is read from ComfyUI when you press the button.</div>
            </section>

            <section class="c2a-section">
                <h3>Payload inputs</h3>
                <label class="c2a-label">Find node by name or ID<input class="c2a-input" data-field="node_search" placeholder="Search nodes"></label>
                <div class="c2a-grid c2a-select-grid">
                    <select class="c2a-input c2a-node-list" data-field="node_id" size="7" aria-label="Workflow nodes"></select>
                    <select class="c2a-input" data-field="node_input" aria-label="Unconnected node inputs"></select>
                </div>
                <button class="c2a-button" data-action="add-mapping">Expose selected input</button>
                <div class="c2a-note">Only unconnected inputs can be exposed as payload values.</div>
                <div class="c2a-mappings" data-role="mappings"></div>
            </section>

            <section class="c2a-section">
                <h3>Models</h3>
                <div class="c2a-note">Enter the actual HTTPS download URL and ComfyUI model folder for each model.</div>
                <div data-role="models"></div>
                <button class="c2a-button c2a-button-secondary" data-action="add-model">Add model</button>
            </section>

            <section class="c2a-section">
                <h3>Custom nodes</h3>
                <div class="c2a-note">Enter each custom node Git repository URL. Workflow nodes do not identify repository URLs reliably.</div>
                <div data-role="custom-nodes"></div>
                <button class="c2a-button c2a-button-secondary" data-action="add-custom-node">Add custom node repository</button>
            </section>

            <section class="c2a-section c2a-download-section">
                <h3>Export configuration</h3>
                <div class="c2a-note">Download both files, then provide their contents to the Comfy2API MCP build tool.</div>
                <button class="c2a-button" data-action="export">Prepare configuration</button>
                <div class="c2a-downloads" data-role="downloads"></div>
                <div class="c2a-note" data-role="export-status"></div>
            </section>
        </div>`;

    injectStyles();
    const state = { workflow: null, nodes: [], mappings: [], models: [], customNodes: [] };
    const byField = (name) => root.querySelector(`[data-field="${name}"]`);
    const byRole = (name) => root.querySelector(`[data-role="${name}"]`);
    const status = (message, error = false) => {
        const el = byRole("workflow-status");
        el.textContent = message;
        el.classList.toggle("error", error);
    };

    root.querySelector('[data-action="refresh"]').addEventListener("click", async () => {
        try {
            if (typeof app.graphToPrompt !== "function") {
                throw new Error("This ComfyUI frontend does not expose graphToPrompt(). Update ComfyUI and its frontend.");
            }
            status("Reading workflow…");
            const prompt = await app.graphToPrompt();
            if (!prompt?.output || typeof prompt.output !== "object" || Array.isArray(prompt.output)) {
                throw new Error("ComfyUI did not return an API-format workflow.");
            }
            state.workflow = prompt.output;
            const canvasNodes = new Map((app.graph?._nodes || []).map((node) => [String(node.id), node]));
            state.nodes = Object.entries(state.workflow).map(([id, node]) => {
                const canvasNode = canvasNodes.get(String(id));
                const title = node?._meta?.title || canvasNode?.title || canvasNode?.type || node.class_type;
                const inputs = Object.entries(node.inputs || {})
                    .filter(([, value]) => !LINK_VALUE(value))
                    .map(([field, value]) => ({ field, value }));
                return { id, classType: node.class_type, title, inputs };
            });
            renderNodeOptions();
            renderOutputOptions();
            status(`Loaded ${state.nodes.length} API nodes. Select a payload input and output node.`);
        } catch (error) {
            state.workflow = null;
            state.nodes = [];
            renderNodeOptions();
            renderOutputOptions();
            status(error instanceof Error ? error.message : String(error), true);
        }
    });

    function renderNodeOptions() {
        const list = byField("node_id");
        const query = byField("node_search").value.trim().toLowerCase();
        list.replaceChildren();
        const visible = state.nodes.filter((node) => `${node.id} ${node.title} ${node.classType}`.toLowerCase().includes(query));
        for (const node of visible) {
            const option = new Option(`${node.id} · ${node.title} [${node.classType}]`, node.id);
            list.add(option);
        }
        if (list.options.length) list.selectedIndex = 0;
        renderInputOptions();
    }

    function renderInputOptions() {
        const node = state.nodes.find((candidate) => candidate.id === byField("node_id").value);
        const list = byField("node_input");
        list.replaceChildren();
        for (const input of node?.inputs || []) {
            list.add(new Option(`${input.field} = ${shortValue(input.value)}`, input.field));
        }
        if (!list.options.length) list.add(new Option("No unconnected inputs", ""));
    }

    function renderOutputOptions() {
        const select = byField("output_node_id");
        select.replaceChildren();
        const candidates = state.nodes.filter((node) => OUTPUT_NODE.test(node.classType));
        select.add(new Option(candidates.length ? "Select output node" : "No recognized output node", ""));
        for (const node of candidates) select.add(new Option(`${node.id} · ${node.title} [${node.classType}]`, node.id));
    }

    function addMapping(nodeId, field) {
        const node = state.nodes.find((candidate) => candidate.id === nodeId);
        const input = node?.inputs.find((candidate) => candidate.field === field);
        if (!node || !input) return;
        if (state.mappings.some((entry) => entry.node_id === nodeId && entry.field === field)) {
            status(`Input ${field} on node ${nodeId} is already exposed.`, true);
            return;
        }
        const inferredType = /image|loadimage/i.test(`${node.classType} ${field}`) ? "image"
            : /^seed$/i.test(field) ? "seed"
                : typeof input.value === "number" ? "number" : "text";
        state.mappings.push({
            payloadKey: field,
            node_id: nodeId,
            field,
            ui_type: inferredType,
            required: false,
            label: field.replaceAll("_", " "),
            hasDefault: inferredType !== "image" && input.value !== undefined && input.value !== null,
            defaultText: input.value === undefined || input.value === null ? "" : String(input.value),
            minText: "", maxText: "", stepText: "", choicesText: "",
        });
        renderMappings();
    }

    function renderMappings() {
        const container = byRole("mappings");
        container.replaceChildren();
        for (const mapping of state.mappings) {
            const card = document.createElement("div");
            card.className = "c2a-mapping-card";
            card.innerHTML = `
                <div class="c2a-card-heading"><strong>${escapeHtml(mapping.node_id)} · ${escapeHtml(mapping.field)}</strong><button class="c2a-remove" type="button" aria-label="Remove mapping">Remove</button></div>
                <div class="c2a-grid">
                    <label class="c2a-label">Payload key<input class="c2a-input" data-prop="payloadKey"></label>
                    <label class="c2a-label">Input type<select class="c2a-input" data-prop="ui_type">${UI_TYPES.map((type) => `<option value="${type}">${type}</option>`).join("")}</select></label>
                </div>
                <label class="c2a-label">Label<input class="c2a-input" data-prop="label"></label>
                <label class="c2a-check"><input type="checkbox" data-prop="hasDefault"> Use default value</label>
                <label class="c2a-label">Default value<input class="c2a-input" data-prop="defaultText"></label>
                <div class="c2a-grid c2a-constraints">
                    <label class="c2a-label">Min<input class="c2a-input" data-prop="minText" type="number"></label>
                    <label class="c2a-label">Max<input class="c2a-input" data-prop="maxText" type="number"></label>
                    <label class="c2a-label">Step<input class="c2a-input" data-prop="stepText" type="number"></label>
                </div>
                <label class="c2a-label">Choices (one per line)<textarea class="c2a-input" data-prop="choicesText" rows="2"></textarea></label>
                <label class="c2a-check"><input type="checkbox" data-prop="required"> Required</label>`;
            const index = state.mappings.indexOf(mapping);
            card.querySelector('[data-prop="payloadKey"]').value = mapping.payloadKey;
            card.querySelector('[data-prop="ui_type"]').value = mapping.ui_type;
            card.querySelector('[data-prop="label"]').value = mapping.label;
            card.querySelector('[data-prop="hasDefault"]').checked = mapping.hasDefault;
            card.querySelector('[data-prop="defaultText"]').value = mapping.defaultText;
            card.querySelector('[data-prop="minText"]').value = mapping.minText;
            card.querySelector('[data-prop="maxText"]').value = mapping.maxText;
            card.querySelector('[data-prop="stepText"]').value = mapping.stepText;
            card.querySelector('[data-prop="choicesText"]').value = mapping.choicesText;
            card.querySelector('[data-prop="required"]').checked = mapping.required;
            for (const control of card.querySelectorAll("[data-prop]")) {
                const prop = control.dataset.prop;
                const eventName = control.type === "checkbox" || control.tagName === "SELECT" ? "change" : "input";
                control.addEventListener(eventName, () => { mapping[prop] = control.type === "checkbox" ? control.checked : control.value; });
            }
            card.querySelector(".c2a-remove").addEventListener("click", () => {
                state.mappings.splice(index, 1);
                renderMappings();
            });
            container.appendChild(card);
        }
    }

    function addDependency(kind, value = {}) {
        const items = kind === "model" ? state.models : state.customNodes;
        const container = byRole(kind === "model" ? "models" : "custom-nodes");
        const item = kind === "model" ? { url: "", dest_dir: "" } : { url: "" };
        items.push(item);
        const card = document.createElement("div");
        card.className = "c2a-dependency-card";
        if (kind === "model") {
            card.innerHTML = `<label class="c2a-label">Download URL<input class="c2a-input" data-prop="url" placeholder="https://huggingface.co/.../resolve/main/model.safetensors"></label><div class="c2a-grid"><label class="c2a-label">ComfyUI model folder<input class="c2a-input" data-prop="dest_dir" placeholder="diffusion_models"></label><button class="c2a-remove" type="button">Remove</button></div>`;
        } else {
            card.innerHTML = `<label class="c2a-label">Git repository URL<input class="c2a-input" data-prop="url" placeholder="https://github.com/owner/custom-node"></label><button class="c2a-remove" type="button">Remove</button>`;
        }
        for (const control of card.querySelectorAll("[data-prop]")) {
            control.value = item[control.dataset.prop];
            control.addEventListener("input", () => { item[control.dataset.prop] = control.value.trim(); });
        }
        card.querySelector(".c2a-remove").addEventListener("click", () => {
            const index = items.indexOf(item);
            if (index >= 0) items.splice(index, 1);
            card.remove();
        });
        container.appendChild(card);
    }

    function buildManifest() {
        if (!state.workflow) throw new Error("Read the active workflow first.");
        const name = byField("name").value.trim();
        if (!name) throw new Error("Enter a Space name.");
        const slug = slugify(name);
        if (!slug || slug.length > 63) throw new Error("The Space name must produce a slug of 1 to 63 lowercase letters, numbers, or hyphens.");
        if (!byField("output_node_id").value) throw new Error("Select a recognized output node.");
        if (!state.mappings.length) throw new Error("Expose at least one workflow input.");
        const apiMapping = {};
        for (const mapping of state.mappings) {
            const key = mapping.payloadKey.trim();
            if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) throw new Error(`Payload key '${key}' must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.`);
            if (Object.hasOwn(apiMapping, key)) throw new Error(`Payload key '${key}' is duplicated.`);
            const field = {
                node_id: mapping.node_id,
                field: mapping.field,
                ui_type: mapping.ui_type,
                required: mapping.required,
                label: mapping.label.trim() || key,
            };
            if (mapping.hasDefault) {
                try { field.default = JSON.parse(mapping.defaultText); }
                catch { field.default = mapping.defaultText; }
            }
            for (const property of ["min", "max", "step"]) {
                const text = mapping[`${property}Text`].trim();
                if (text) {
                    const number = Number(text);
                    if (!Number.isFinite(number)) throw new Error(`The ${property} value for '${key}' must be a finite number.`);
                    field[property] = number;
                }
            }
            const choices = mapping.choicesText.split("\n").map((choice) => choice.trim()).filter(Boolean);
            if (choices.length) field.choices = choices;
            apiMapping[key] = field;
        }
        for (const [index, model] of state.models.entries()) {
            if (!model.url || !model.dest_dir) throw new Error(`Complete the model URL and destination folder for model ${index + 1}.`);
            if (!/^https:\/\//i.test(model.url)) throw new Error(`Model ${index + 1} URL must use HTTPS.`);
        }
        for (const [index, node] of state.customNodes.entries()) {
            if (!node.url || !/^https:\/\//i.test(node.url)) throw new Error(`Custom node repository ${index + 1} must have an HTTPS URL.`);
        }
        const duration = Number(byField("zerogpu_duration").value);
        if (!Number.isInteger(duration) || duration < 1 || duration > 300) throw new Error("ZeroGPU duration must be an integer from 1 to 300 seconds.");
        const workflowFile = `${slug}.workflow.api.json`;
        return {
            schema_version: "jekspace-comfy2api/v1",
            name,
            output_type: byField("output_type").value,
            output_node_id: byField("output_node_id").value,
            api_mapping: apiMapping,
            models: state.models.map(({ url, dest_dir }) => ({ url: url.trim(), dest_dir: dest_dir.trim() })),
            custom_nodes: state.customNodes.map(({ url }) => url.trim()),
            zerogpu_duration: duration,
            workflow_file: workflowFile,
        };
    }

    function offerDownload(filename, content, label, container) {
        const blob = new Blob([content], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.textContent = label;
        link.className = "c2a-download-link";
        link.addEventListener("click", () => setTimeout(() => URL.revokeObjectURL(url), 60_000), { once: true });
        container.appendChild(link);
    }

    root.querySelector('[data-action="add-mapping"]').addEventListener("click", () => {
        addMapping(byField("node_id").value, byField("node_input").value);
    });
    root.querySelector('[data-action="add-model"]').addEventListener("click", () => addDependency("model"));
    root.querySelector('[data-action="add-custom-node"]').addEventListener("click", () => addDependency("custom"));
    root.querySelector('[data-action="export"]').addEventListener("click", () => {
        const downloads = byRole("downloads");
        const exportStatus = byRole("export-status");
        downloads.replaceChildren();
        try {
            const manifest = buildManifest();
            const manifestJson = JSON.stringify(manifest, null, 2);
            const workflowJson = JSON.stringify(state.workflow, null, 2);
            const slug = slugify(manifest.name);
            offerDownload(`${slug}.manifest.json`, manifestJson, "Download manifest", downloads);
            offerDownload(manifest.workflow_file, workflowJson, "Download API workflow", downloads);
            exportStatus.textContent = "Configuration is ready. Download both files.";
            exportStatus.classList.remove("error");
        } catch (error) {
            exportStatus.textContent = error instanceof Error ? error.message : String(error);
            exportStatus.classList.add("error");
        }
    });
    byField("node_search").addEventListener("input", renderNodeOptions);
    byField("node_id").addEventListener("change", renderInputOptions);

    return root;
}

function shortValue(value) {
    if (typeof value === "string") return JSON.stringify(value.length > 48 ? `${value.slice(0, 45)}…` : value);
    const text = JSON.stringify(value);
    return text.length > 48 ? `${text.slice(0, 45)}…` : text;
}

function slugify(value) {
    return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function injectStyles() {
    if (document.getElementById("c2a-styles")) return;
    const style = document.createElement("style");
    style.id = "c2a-styles";
    style.textContent = `
        .c2a-panel { display:flex; flex-direction:column; min-height:0; height:100%; color:#e0e0e0; font:12px system-ui,sans-serif; background:#0d0d12; }
        .c2a-header { display:flex; flex-direction:column; gap:5px; padding:13px 14px; border-bottom:1px solid rgba(255,255,255,.08); flex:none; }
        .c2a-header strong { color:#fff; font-size:14px; }
        .c2a-header span,.c2a-note { color:rgba(255,255,255,.55); line-height:1.45; }
        .c2a-scroll { overflow:auto; min-height:0; }
        .c2a-section { padding:13px 14px; border-bottom:1px solid rgba(255,255,255,.08); }
        .c2a-section h3 { margin:0 0 10px; color:#fff; font-size:12px; }
        .c2a-label { display:flex; flex-direction:column; gap:5px; margin:8px 0; color:rgba(255,255,255,.72); }
        .c2a-input { width:100%; min-width:0; box-sizing:border-box; padding:8px 9px; border:1px solid rgba(255,255,255,.12); border-radius:6px; color:#eee; background:#18181f; font:12px system-ui,sans-serif; }
        .c2a-input:focus { outline:1px solid #7771ff; border-color:#7771ff; }
        .c2a-grid { display:grid; grid-template-columns:1fr 1fr; align-items:end; gap:7px; }
        .c2a-select-grid { grid-template-columns:1fr 1fr; align-items:stretch; }
        .c2a-node-list { height:142px; }
        .c2a-button { width:100%; margin:7px 0 2px; padding:8px 10px; border:0; border-radius:6px; color:white; background:#5d58d8; cursor:pointer; font-weight:600; }
        .c2a-button:hover { background:#716cff; }
        .c2a-button-secondary { background:rgba(255,255,255,.08); color:#ddd; }
        .c2a-note { margin-top:7px; font-size:11px; }
        .c2a-note.error,.c2a-note[data-role="export-status"].error { color:#ff9898; }
        .c2a-mapping-card,.c2a-dependency-card { margin-top:9px; padding:9px; border:1px solid rgba(255,255,255,.09); border-radius:7px; background:rgba(255,255,255,.025); }
        .c2a-card-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; color:white; }
        .c2a-remove { border:0; padding:5px 7px; border-radius:5px; color:#ffaaaa; background:rgba(255,100,100,.11); cursor:pointer; }
        .c2a-check { display:flex; align-items:center; gap:7px; margin-top:8px; }
        .c2a-download-section { padding-bottom:20px; }
        .c2a-downloads { display:flex; flex-direction:column; gap:8px; margin-top:9px; }
        .c2a-download-link { padding:8px 10px; border-radius:6px; background:rgba(255,255,255,.08); color:#c8c6ff; text-decoration:none; text-align:center; }
        .c2a-download-link:hover { background:rgba(255,255,255,.14); }
        @media(max-width:360px) { .c2a-grid,.c2a-select-grid { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
}
