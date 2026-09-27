"use client";

import {
  type ChangeEvent, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent,
  type ReactNode, useEffect, useMemo, useRef, useState,
} from "react";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Copy, FileUp,
  GripVertical, Heading1, ImagePlus, Layers3, LayoutGrid, Minus, PanelTop,
  PenLine, Plus, QrCode, Quote, Redo2, Rows3, SlidersHorizontal, Space,
  Trash2, Type, Undo2, ZoomIn, ZoomOut,
} from "lucide-react";
import {
  customBlockKey, normaliseTemplateBlockStyles, templateCustomBlockSchema,
  type TemplateBlockStyle, type TemplateCustomBlock,
} from "@/lib/document-template-blocks";

type BuiltInBlock = { key: string; label: string; detail: string; fixedWidth?: boolean };
type BuilderPanel = "INSERT" | "LAYERS" | "STYLE";
type Snapshot = { order: string[]; customBlocks: TemplateCustomBlock[]; blockStyles: TemplateBlockStyle[] };

function componentId() {
  return globalThis.crypto?.randomUUID?.()
    || `block-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function copySnapshot(snapshot: Snapshot): Snapshot {
  return {
    order: [...snapshot.order],
    customBlocks: snapshot.customBlocks.map(block => ({ ...block })),
    blockStyles: snapshot.blockStyles.map(style => ({ ...style })),
  };
}

const STYLE_LABELS = {
  FULL: "Full width", TWO_THIRDS: "Two thirds", HALF: "Half", THIRD: "One third",
  PLAIN: "Plain", OUTLINE: "Outline", TINT: "Soft tint", ACCENT: "Accent",
  COMPACT: "Compact", STANDARD: "Standard", RELAXED: "Relaxed",
} as const;

const KIND_LABELS: Record<TemplateCustomBlock["kind"], string> = {
  HEADING: "Heading", TEXT: "Text", IMAGE: "Image", CALLOUT: "Callout",
  QR: "QR code", SIGNATURE: "Signature", DIVIDER: "Divider", SPACER: "Spacer",
};

export function DocumentLayoutEditor({
  builtIns, order, customBlocks, blockStyles, preview, documentKey, compact = false, onChange, onError,
}: {
  builtIns: readonly BuiltInBlock[];
  order: string[];
  customBlocks: TemplateCustomBlock[];
  blockStyles: TemplateBlockStyle[];
  preview: ReactNode;
  documentKey: string;
  compact?: boolean;
  onChange: (order: string[], customBlocks: TemplateCustomBlock[], blockStyles: TemplateBlockStyle[]) => void;
  onError: (message: string) => void;
}) {
  const [panel, setPanel] = useState<BuilderPanel>("INSERT");
  const [dragged, setDragged] = useState("");
  const [selected, setSelected] = useState(order[0] || "");
  const [zoom, setZoom] = useState(90);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [editLabel, setEditLabel] = useState("");
  const [editContent, setEditContent] = useState("");
  const imageRef = useRef<HTMLInputElement>(null);
  const componentRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageTarget = useRef("");
  const previousDocumentKey = useRef(documentKey);
  const customByKey = new Map(customBlocks.map(block => [customBlockKey(block.id), block]));
  const builtInByKey = new Map(builtIns.map(block => [block.key, block]));
  const styles = useMemo(() => normaliseTemplateBlockStyles(blockStyles, order), [blockStyles, order]);
  const styleByKey = new Map(styles.map(style => [style.key, style]));
  const selectedStyle = styleByKey.get(selected);
  const selectedBuiltIn = builtInByKey.get(selected);
  const selectedCustom = customByKey.get(selected);

  useEffect(() => {
    if (!order.includes(selected)) setSelected(order[0] || "");
  }, [order, selected]);

  useEffect(() => {
    if (previousDocumentKey.current === documentKey) return;
    previousDocumentKey.current = documentKey;
    setPast([]);
    setFuture([]);
    setSelected(order[0] || "");
    setPanel("INSERT");
  }, [documentKey, order]);

  useEffect(() => {
    setEditLabel(selectedCustom?.label || "");
    setEditContent(selectedCustom?.content || "");
  }, [selectedCustom?.content, selectedCustom?.label]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.querySelectorAll<HTMLElement>("[data-document-block]").forEach(element => {
      element.classList.toggle("builder-selected", element.dataset.documentBlock === selected);
    });
  }, [preview, selected]);

  function currentSnapshot(): Snapshot {
    return copySnapshot({ order, customBlocks, blockStyles: styles });
  }

  function emit(snapshot: Snapshot) {
    const allowed = new Set(snapshot.order);
    onChange(
      snapshot.order,
      snapshot.customBlocks,
      snapshot.blockStyles.filter(style => allowed.has(style.key)),
    );
  }

  function commit(nextOrder = order, nextBlocks = customBlocks, nextStyles = styles) {
    setPast(history => [...history.slice(-39), currentSnapshot()]);
    setFuture([]);
    emit(copySnapshot({ order: nextOrder, customBlocks: nextBlocks, blockStyles: nextStyles }));
  }

  function undo() {
    const target = past.at(-1);
    if (!target) return;
    setPast(history => history.slice(0, -1));
    setFuture(history => [currentSnapshot(), ...history].slice(0, 40));
    emit(target);
  }

  function redo() {
    const target = future[0];
    if (!target) return;
    setPast(history => [...history.slice(-39), currentSnapshot()]);
    setFuture(history => history.slice(1));
    emit(target);
  }

  function selectLayer(key: string) {
    if (!order.includes(key)) return;
    setSelected(key);
    setPanel("STYLE");
  }

  function selectFromPreview(event: ReactMouseEvent<HTMLDivElement>) {
    const layer = (event.target as HTMLElement).closest<HTMLElement>("[data-document-block]");
    if (layer?.dataset.documentBlock) selectLayer(layer.dataset.documentBlock);
  }

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commit(next);
  }

  function drop(event: DragEvent<HTMLDivElement>, target: string) {
    event.preventDefault();
    move(order.indexOf(dragged), order.indexOf(target));
    setDragged("");
  }

  function addBlock(block: TemplateCustomBlock) {
    if (customBlocks.length >= 12) return onError("A template can contain up to twelve custom components.");
    const key = customBlockKey(block.id);
    const nextStyle: TemplateBlockStyle = {
      key,
      width: "FULL",
      surface: block.kind === "CALLOUT" ? "TINT" : "PLAIN",
      spacing: block.kind === "SPACER" ? "RELAXED" : "STANDARD",
      alignment: block.alignment,
    };
    commit([...order, key], [...customBlocks, block], [...styles, nextStyle]);
    setSelected(key);
    setPanel("STYLE");
  }

  function addQuick(kind: Exclude<TemplateCustomBlock["kind"], "IMAGE">) {
    const presets: Record<typeof kind, Pick<TemplateCustomBlock, "label" | "content" | "alignment">> = {
      HEADING: { label: "Section heading", content: "A new section", alignment: "LEFT" },
      TEXT: { label: "Text block", content: "Add your customer-facing text here.", alignment: "LEFT" },
      CALLOUT: { label: "Important note", content: "Add an important note for your customer.", alignment: "LEFT" },
      QR: { label: "Scan for more", content: "https://example.com", alignment: "CENTER" },
      SIGNATURE: { label: "Authorisation", content: "Authorised signature", alignment: "LEFT" },
      DIVIDER: { label: "Section divider", content: "", alignment: "CENTER" },
      SPACER: { label: "Breathing space", content: "", alignment: "CENTER" },
    };
    const parsed = templateCustomBlockSchema.safeParse({ id: componentId(), kind, ...presets[kind] });
    if (!parsed.success) return onError(parsed.error.issues[0]?.message || "This component could not be added.");
    addBlock(parsed.data);
  }

  function openImagePicker(target = "") {
    imageTarget.current = target;
    imageRef.current?.click();
  }

  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 200_000) {
      return onError("Custom images must be PNG, JPEG or WebP files under 200 KB.");
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      const target = imageTarget.current;
      imageTarget.current = "";
      if (target) {
        const block = customByKey.get(target);
        if (!block || block.kind !== "IMAGE") return;
        commit(order, customBlocks.map(item => item.id === block.id ? { ...item, label: file.name.slice(0, 60), content } : item));
        return;
      }
      addBlock({ id: componentId(), kind: "IMAGE", label: file.name.slice(0, 60), content, alignment: "CENTER" });
    };
    reader.onerror = () => onError("The custom image could not be read.");
    reader.readAsDataURL(file);
  }

  async function importComponent(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 320_000) return onError("External component JSON must be under 320 KB.");
    try {
      const raw = JSON.parse(await file.text());
      const parsed = templateCustomBlockSchema.safeParse({ ...raw, id: componentId() });
      if (!parsed.success) return onError(parsed.error.issues[0]?.message || "This component file is not valid.");
      addBlock(parsed.data);
    } catch {
      onError("This component file is not valid JSON.");
    }
  }

  function saveCustom() {
    if (!selectedCustom) return;
    const parsed = templateCustomBlockSchema.safeParse({
      ...selectedCustom,
      label: editLabel.trim(),
      content: editContent.trim(),
      alignment: selectedStyle?.alignment || selectedCustom.alignment,
    });
    if (!parsed.success) return onError(parsed.error.issues[0]?.message || "Check this component's content.");
    commit(order, customBlocks.map(block => block.id === selectedCustom.id ? parsed.data : block));
  }

  function duplicateCustom() {
    if (!selectedCustom || !selectedStyle) return;
    if (customBlocks.length >= 12) return onError("A template can contain up to twelve custom components.");
    const duplicate = { ...selectedCustom, id: componentId(), label: `${selectedCustom.label} copy`.slice(0, 60) };
    const key = customBlockKey(duplicate.id);
    const index = order.indexOf(selected) + 1;
    const nextOrder = [...order];
    nextOrder.splice(index, 0, key);
    commit(nextOrder, [...customBlocks, duplicate], [...styles, { ...selectedStyle, key }]);
    setSelected(key);
  }

  function removeCustom(key: string) {
    const block = customByKey.get(key);
    if (!block) return;
    const nextOrder = order.filter(item => item !== key);
    commit(nextOrder, customBlocks.filter(item => item.id !== block.id), styles.filter(style => style.key !== key));
    setSelected(nextOrder[Math.max(0, order.indexOf(key) - 1)] || nextOrder[0] || "");
    setPanel("LAYERS");
  }

  function updateStyle(patch: Partial<TemplateBlockStyle>) {
    if (!selectedStyle) return;
    commit(order, customBlocks, styles.map(style => style.key === selected ? { ...style, ...patch } : style));
  }

  function applyKit(kit: "EDITORIAL" | "STUDIO" | "MINIMAL") {
    const next = styles.map((style, index) => {
      const fixed = compact || builtInByKey.get(style.key)?.fixedWidth;
      if (kit === "MINIMAL") return { ...style, width: "FULL" as const, surface: "PLAIN" as const, spacing: "COMPACT" as const };
      if (kit === "EDITORIAL") return {
        ...style,
        width: "FULL" as const,
        surface: (["HEADER", "TOTALS", "FOOTER"].includes(style.key) ? "TINT" : "PLAIN") as TemplateBlockStyle["surface"],
        spacing: "STANDARD" as const,
      };
      return {
        ...style,
        width: fixed ? "FULL" as const : (index % 3 === 1 ? "HALF" as const : "FULL" as const),
        surface: (index % 3 === 1 ? "OUTLINE" : "PLAIN") as TemplateBlockStyle["surface"],
        spacing: "RELAXED" as const,
      };
    });
    commit(order, customBlocks, next);
  }

  const zoomStyle = { "--document-builder-zoom": zoom / 100 } as CSSProperties;

  return <section className="document-layout-builder">
    <header className="document-builder-topbar">
      <div><span className="eyebrow">VISUAL DOCUMENT BUILDER</span><strong>Design directly on the document</strong><p>Click any section on the page, then arrange and style it without touching code.</p></div>
      <div className="document-builder-tools" aria-label="Editor tools">
        <button type="button" onClick={undo} disabled={!past.length} aria-label="Undo"><Undo2 /></button>
        <button type="button" onClick={redo} disabled={!future.length} aria-label="Redo"><Redo2 /></button>
        <span />
        <button type="button" onClick={() => setZoom(value => Math.max(60, value - 10))} disabled={zoom <= 60} aria-label="Zoom out"><ZoomOut /></button>
        <output aria-label="Canvas zoom">{zoom}%</output>
        <button type="button" onClick={() => setZoom(value => Math.min(110, value + 10))} disabled={zoom >= 110} aria-label="Zoom in"><ZoomIn /></button>
      </div>
    </header>

    <div className="document-builder-shell">
      <div className="document-canvas-stage">
        <header><span><i />LIVE DOCUMENT</span><small>{selectedStyle ? `Editing ${selectedBuiltIn?.label || selectedCustom?.label}` : "Select a section to edit"}</small></header>
        <div className="document-live-canvas" ref={canvasRef} onClick={selectFromPreview} style={zoomStyle}>
          <div className={`document-canvas-page ${compact ? "is-receipt" : "is-invoice"}`}>{preview}</div>
        </div>
      </div>

      <aside className="document-builder-sidebar">
        <nav aria-label="Builder panels">
          <button type="button" className={panel === "INSERT" ? "active" : ""} aria-pressed={panel === "INSERT"} onClick={() => setPanel("INSERT")}><Plus />Insert</button>
          <button type="button" className={panel === "LAYERS" ? "active" : ""} aria-pressed={panel === "LAYERS"} onClick={() => setPanel("LAYERS")}><Layers3 />Layers</button>
          <button type="button" className={panel === "STYLE" ? "active" : ""} aria-pressed={panel === "STYLE"} onClick={() => setPanel("STYLE")}><SlidersHorizontal />Style</button>
        </nav>

        {panel === "INSERT" ? <div className="document-builder-sidebar-panel">
          <header><strong>Insert</strong><small>Add print-safe content blocks. No scripts or executable HTML.</small></header>
          <div className="document-insert-grid">
            <button type="button" onClick={() => addQuick("HEADING")}><Heading1 /><span>Heading</span></button>
            <button type="button" onClick={() => addQuick("TEXT")}><Type /><span>Text</span></button>
            <button type="button" onClick={() => addQuick("CALLOUT")}><Quote /><span>Callout</span></button>
            <button type="button" onClick={() => openImagePicker()}><ImagePlus /><span>Image</span></button>
            <button type="button" onClick={() => addQuick("QR")}><QrCode /><span>QR code</span></button>
            <button type="button" onClick={() => addQuick("SIGNATURE")}><PenLine /><span>Signature</span></button>
            <button type="button" onClick={() => addQuick("DIVIDER")}><Minus /><span>Divider</span></button>
            <button type="button" onClick={() => addQuick("SPACER")}><Space /><span>Spacer</span></button>
          </div>
          <div className="document-import-card">
            <FileUp />
            <div><strong>External component</strong><small>Import a validated component JSON file.</small></div>
            <button type="button" onClick={() => componentRef.current?.click()}>Import</button>
          </div>
          <p className="document-component-count"><strong>{customBlocks.length}/12</strong> custom components used</p>
        </div> : null}

        {panel === "LAYERS" ? <div className="document-builder-sidebar-panel">
          <header><strong>Page structure</strong><small>Drag sections into the order they should print.</small></header>
          <div className="document-layout-kits" aria-label="Professional layout kits">
            <button type="button" onClick={() => applyKit("EDITORIAL")}><PanelTop /><span><strong>Editorial</strong><small>Structured</small></span></button>
            <button type="button" onClick={() => applyKit("STUDIO")}><LayoutGrid /><span><strong>Studio</strong><small>Modular</small></span></button>
            <button type="button" onClick={() => applyKit("MINIMAL")}><Rows3 /><span><strong>Essential</strong><small>Compact</small></span></button>
          </div>
          <div className="document-layout-list">
            {order.map((key, index) => {
              const builtIn = builtInByKey.get(key);
              const custom = customByKey.get(key);
              if (!builtIn && !custom) return null;
              return <div key={key} className={selected === key ? "selected" : ""} draggable role="button" tabIndex={0} onDragStart={() => setDragged(key)} onDragOver={event => event.preventDefault()} onDrop={event => drop(event, key)} onClick={() => selectLayer(key)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") selectLayer(key); }}>
                <GripVertical aria-hidden="true" />
                <span><strong>{builtIn?.label || custom?.label}</strong><small>{builtIn?.detail || `${KIND_LABELS[custom!.kind]} component`}</small></span>
                <i>{builtIn ? "LOCKED" : "CUSTOM"}</i>
                <button type="button" aria-label="Move layer up" onClick={event => { event.stopPropagation(); move(index, index - 1); }} disabled={!index}><ArrowUp /></button>
                <button type="button" aria-label="Move layer down" onClick={event => { event.stopPropagation(); move(index, index + 1); }} disabled={index === order.length - 1}><ArrowDown /></button>
              </div>;
            })}
          </div>
        </div> : null}

        {panel === "STYLE" ? <div className="document-builder-sidebar-panel document-style-panel">
          {selectedStyle ? <>
            <header><span className="eyebrow">SELECTED SECTION</span><strong>{selectedBuiltIn?.label || selectedCustom?.label}</strong><small>{selectedBuiltIn?.detail || (selectedCustom ? `${KIND_LABELS[selectedCustom.kind]} component` : "")}</small></header>
            {selectedCustom ? <div className="document-content-fields">
              <label><span>Component name</span><input value={editLabel} maxLength={60} onChange={event => setEditLabel(event.target.value)} /></label>
              {selectedCustom.kind === "IMAGE" ? <button type="button" className="document-replace-image" onClick={() => openImagePicker(selected)}><ImagePlus />Replace image</button> : selectedCustom.kind !== "DIVIDER" && selectedCustom.kind !== "SPACER" ? <label><span>{selectedCustom.kind === "QR" ? "Destination URL" : selectedCustom.kind === "SIGNATURE" ? "Signature label" : "Content"}</span>{["TEXT", "CALLOUT"].includes(selectedCustom.kind) ? <textarea rows={4} maxLength={1000} value={editContent} onChange={event => setEditContent(event.target.value)} /> : <input type={selectedCustom.kind === "QR" ? "url" : "text"} maxLength={selectedCustom.kind === "SIGNATURE" ? 120 : 1000} value={editContent} onChange={event => setEditContent(event.target.value)} />}</label> : null}
              <button type="button" className="button button-secondary document-apply-content" onClick={saveCustom}>Apply content</button>
            </div> : <p className="document-inspector-note">Financial data inside this section is protected. You can move and style it, but required fields cannot be removed.</p>}
            {!compact && !selectedBuiltIn?.fixedWidth ? <label><span>Width</span><select value={selectedStyle.width} onChange={event => updateStyle({ width: event.target.value as TemplateBlockStyle["width"] })}>{(["FULL", "TWO_THIRDS", "HALF", "THIRD"] as const).map(value => <option value={value} key={value}>{STYLE_LABELS[value]}</option>)}</select></label> : <p className="document-inspector-note">This section stays full width for reliable printing.</p>}
            <label><span>Surface</span><select value={selectedStyle.surface} onChange={event => updateStyle({ surface: event.target.value as TemplateBlockStyle["surface"] })}>{(["PLAIN", "OUTLINE", "TINT", "ACCENT"] as const).map(value => <option value={value} key={value}>{STYLE_LABELS[value]}</option>)}</select></label>
            <label><span>Spacing</span><select value={selectedStyle.spacing} onChange={event => updateStyle({ spacing: event.target.value as TemplateBlockStyle["spacing"] })}>{(["COMPACT", "STANDARD", "RELAXED"] as const).map(value => <option value={value} key={value}>{STYLE_LABELS[value]}</option>)}</select></label>
            <div><span className="document-control-label">Alignment</span><div className="document-alignment" aria-label="Text alignment">{(["LEFT", "CENTER", "RIGHT"] as const).map(value => <button type="button" aria-label={`Align ${value.toLocaleLowerCase()}`} className={selectedStyle.alignment === value ? "active" : ""} key={value} onClick={() => updateStyle({ alignment: value })}>{value === "LEFT" ? <AlignLeft /> : value === "CENTER" ? <AlignCenter /> : <AlignRight />}</button>)}</div></div>
            <div className="document-layer-actions">
              <button type="button" onClick={() => move(order.indexOf(selected), order.indexOf(selected) - 1)} disabled={order.indexOf(selected) === 0}><ArrowUp />Up</button>
              <button type="button" onClick={() => move(order.indexOf(selected), order.indexOf(selected) + 1)} disabled={order.indexOf(selected) === order.length - 1}><ArrowDown />Down</button>
              {selectedCustom ? <button type="button" onClick={duplicateCustom}><Copy />Duplicate</button> : null}
              {selectedCustom ? <button type="button" className="danger" onClick={() => removeCustom(selected)}><Trash2 />Delete</button> : null}
            </div>
          </> : <div className="document-empty-inspector"><SlidersHorizontal /><strong>Select a section</strong><p>Click any part of the document or choose a layer to edit it here.</p></div>}
        </div> : null}
      </aside>
    </div>

    <input ref={imageRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleImage} />
    <input ref={componentRef} type="file" accept="application/json,.json" hidden onChange={importComponent} />
  </section>;
}
