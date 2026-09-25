"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, List, ListOrdered, Quote } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { id: string; value: string | null; onChange: (html: string) => void; disabled?: boolean; invalid?: boolean };

/** Rich text (Knowledge Base › Content). HTML is cleaned again on the server before saving. */
export function RichTextEditor({ id, value, onChange, disabled, invalid }: Props) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } })],
    content: value ?? "",
    editable: !disabled,
    immediatelyRender: false, // avoids a hydration mismatch in Next.js
    editorProps: {
      attributes: {
        id,
        class: "prose prose-sm max-w-none min-h-40 px-3 py-2 text-base outline-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_h2]:text-lg [&_h2]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:pl-3",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });

  const tools = [
    { icon: Bold, label: "Bold", run: () => editor?.chain().focus().toggleBold().run(), on: editor?.isActive("bold") },
    { icon: Italic, label: "Italic", run: () => editor?.chain().focus().toggleItalic().run(), on: editor?.isActive("italic") },
    { icon: Heading2, label: "Heading", run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), on: editor?.isActive("heading") },
    { icon: List, label: "Bullet list", run: () => editor?.chain().focus().toggleBulletList().run(), on: editor?.isActive("bulletList") },
    { icon: ListOrdered, label: "Numbered list", run: () => editor?.chain().focus().toggleOrderedList().run(), on: editor?.isActive("orderedList") },
    { icon: Quote, label: "Quote", run: () => editor?.chain().focus().toggleBlockquote().run(), on: editor?.isActive("blockquote") },
  ];

  return (
    <div className={cn("rounded-lg border bg-background", invalid && "border-destructive")}>
      {!disabled && (
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1 border-b p-1">
          {tools.map(({ icon: Icon, label, run, on }) => (
            <button key={label} type="button" onClick={run} aria-label={label} aria-pressed={Boolean(on)} className={cn("inline-flex size-10 items-center justify-center rounded hover:bg-muted", on && "bg-muted")}>
              <Icon className="size-4" aria-hidden />
            </button>
          ))}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
