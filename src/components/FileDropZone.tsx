import { useRef, useState, type ReactNode } from 'react';
import { Upload } from 'lucide-react';

interface FileDropZoneProps {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  title: string;
  hint: string;
  onFiles: (files: File[]) => void;
  children?: ReactNode;
}

export default function FileDropZone({
  accept,
  multiple = false,
  disabled = false,
  title,
  hint,
  onFiles,
  children,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const emit = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) emit(e.dataTransfer.files);
      }}
      className={`w-full border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-all ${
        dragging ? 'border-brand bg-brand/10' : 'border-input bg-card'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          emit(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <Upload size={24} className={dragging ? 'text-brand-strong' : 'text-muted-foreground'} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground/80">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="px-4 py-2 text-sm font-medium bg-brand text-brand-foreground rounded-lg hover:brightness-105 transition-colors disabled:cursor-not-allowed"
        >
          {multiple ? 'Selecionar arquivos' : 'Selecionar arquivo'}
        </button>
        {children}
      </div>
    </div>
  );
}
