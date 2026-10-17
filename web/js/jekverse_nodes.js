import { app } from "../../scripts/app.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

app.registerExtension({
    name: "Jekverse.Nodes",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // =====================================================================
        // 1. Dynamic display for Show Any node
        // =====================================================================
        if (
            nodeData.name === "jekverse showAnything" ||
            nodeData.name === "easy showAnything" ||
            nodeData.name === "Show Any"
        ) {
            function populate(text) {
                if (this.widgets) {
                    const pos = this.widgets.findIndex((w) => w.name === "text");
                    if (pos !== -1) {
                        for (let i = pos; i < this.widgets.length; i++) {
                            this.widgets[i].onRemove?.();
                        }
                        this.widgets.length = pos;
                    }
                }

                const list = Array.isArray(text) ? text : [text];
                for (const item of list) {
                    const w = ComfyWidgets["STRING"](this, "text", ["STRING", { multiline: true }], app).widget;
                    if (w && w.inputEl) {
                        w.inputEl.style.opacity = "0.75";
                        w.value = typeof item === "object" ? JSON.stringify(item, null, 2) : String(item ?? "");
                    }
                }

                requestAnimationFrame(() => {
                    const sz = this.computeSize();
                    if (sz[0] < this.size[0]) sz[0] = this.size[0];
                    if (sz[1] < this.size[1]) sz[1] = this.size[1];
                    this.onResize?.(sz);
                    app.graph.setDirtyCanvas(true, false);
                });
            }

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                onExecuted?.apply(this, arguments);
                if (message && message.text) {
                    populate.call(this, message.text);
                }
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function () {
                onConfigure?.apply(this, arguments);
                if (this.widgets_values && this.widgets_values[0]) {
                    populate.call(this, this.widgets_values[0]);
                }
            };
        }

        // =====================================================================
        // 2. Dynamic auto-growing sockets for Video Merger (MiniMax H3 style)
        // =====================================================================
        if (
            nodeData.name === "jekverse videoMerger" ||
            nodeData.name === "Video Merger" ||
            nodeData.name === "Video Merger (Lossless)"
        ) {
            const MAX_VIDEOS = 10;

            function adjustVideoInputs(node) {
                if (!node.inputs) return;

                // Find highest connected video index (1..10)
                let highestConnected = 0;
                for (let i = 0; i < node.inputs.length; i++) {
                    const input = node.inputs[i];
                    const match = input.name && input.name.match(/^video_(\d+)$/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (input.link != null) {
                            if (num > highestConnected) {
                                highestConnected = num;
                            }
                        }
                    }
                }

                // Desired slot count: at least 2, and exactly 1 empty slot after the highest connected, max 10
                const targetCount = Math.max(2, Math.min(MAX_VIDEOS, highestConnected + 1));

                // 1. Remove excess unconnected video inputs from the end
                for (let num = MAX_VIDEOS; num > targetCount; num--) {
                    const idx = node.inputs.findIndex((inp) => inp.name === `video_${num}`);
                    if (idx !== -1 && node.inputs[idx].link == null) {
                        node.removeInput(idx);
                    }
                }

                // 2. Add missing video inputs up to targetCount
                for (let num = 1; num <= targetCount; num++) {
                    const name = `video_${num}`;
                    const existing = node.inputs.find((inp) => inp.name === name);
                    if (!existing) {
                        node.addInput(name, "VIDEO");
                    }
                }

                // Recompute node display size nicely
                requestAnimationFrame(() => {
                    if (node.computeSize) {
                        const sz = node.computeSize();
                        if (node.setSize) {
                            node.setSize([Math.max(sz[0], node.size[0]), Math.max(sz[1], node.size[1])]);
                        }
                    }
                    if (app.graph) {
                        app.graph.setDirtyCanvas(true, true);
                    }
                });
            }

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                adjustVideoInputs(this);
            };

            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function (type, slotIndex, isConnected, link_info, ioSlot) {
                onConnectionsChange?.apply(this, arguments);
                // Type 1 is LiteGraph.INPUT
                if (type === 1) {
                    adjustVideoInputs(this);
                }
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function () {
                onConfigure?.apply(this, arguments);
                adjustVideoInputs(this);
            };
        }

        // =====================================================================
        // 3. Dynamic auto-growing sockets for Text Index Switch (MiniMax H3 style)
        // =====================================================================
        if (
            nodeData.name === "jekverse textIndexSwitch" ||
            nodeData.name === "easy textIndexSwitch" ||
            nodeData.name === "Text Index Switch"
        ) {
            const MAX_TEXTS = 20;

            function adjustTextInputs(node) {
                if (!node.inputs) return;

                // Find highest connected text index (1..20)
                let highestConnected = 0;
                for (let i = 0; i < node.inputs.length; i++) {
                    const input = node.inputs[i];
                    const match = input.name && input.name.match(/^text(\d+)$/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (input.link != null) {
                            if (num > highestConnected) {
                                highestConnected = num;
                            }
                        }
                    }
                }

                // Desired slot count: at least 2 (text1 and text2), and 1 empty slot after the highest connected, max 20
                const targetCount = Math.max(2, Math.min(MAX_TEXTS, highestConnected + 1));

                // 1. Remove excess unconnected text inputs from the end
                for (let num = MAX_TEXTS; num > targetCount; num--) {
                    const idx = node.inputs.findIndex((inp) => inp.name === `text${num}`);
                    if (idx !== -1 && node.inputs[idx].link == null) {
                        node.removeInput(idx);
                    }
                }

                // 2. Add missing text inputs up to targetCount (before the 'index' socket)
                for (let num = 1; num <= targetCount; num++) {
                    const name = `text${num}`;
                    const existing = node.inputs.find((inp) => inp.name === name);
                    if (!existing) {
                        const indexPos = node.inputs.findIndex((inp) => inp.name === "index");
                        if (indexPos !== -1) {
                            node.addInput(name, "STRING");
                            const lastAdded = node.inputs.pop();
                            node.inputs.splice(indexPos, 0, lastAdded);
                        } else {
                            node.addInput(name, "STRING");
                        }
                    }
                }

                // Recompute node display size nicely
                requestAnimationFrame(() => {
                    if (node.computeSize) {
                        const sz = node.computeSize();
                        if (node.setSize) {
                            node.setSize([Math.max(sz[0], node.size[0]), Math.max(sz[1], node.size[1])]);
                        }
                    }
                    if (app.graph) {
                        app.graph.setDirtyCanvas(true, true);
                    }
                });
            }

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                adjustTextInputs(this);
            };

            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function (type, slotIndex, isConnected, link_info, ioSlot) {
                onConnectionsChange?.apply(this, arguments);
                if (type === 1) {
                    adjustTextInputs(this);
                }
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function () {
                onConfigure?.apply(this, arguments);
                adjustTextInputs(this);
            };
        }
    }
});
