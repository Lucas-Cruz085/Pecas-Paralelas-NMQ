import { useState } from 'react';
import { FileSpreadsheet, Images, Upload } from 'lucide-react';
import SpreadsheetImport from '@/components/SpreadsheetImport';
import ImageImport from '@/components/ImageImport';

type Step = 'spreadsheet' | 'images';

const steps: { id: Step; number: number; label: string; description: string; icon: typeof Upload }[] = [
  { id: 'spreadsheet', number: 1, label: 'Planilha de itens', description: 'Cadastra/atualiza as peças', icon: FileSpreadsheet },
  { id: 'images', number: 2, label: 'Imagens das peças', description: 'Vincula a foto ao código', icon: Images },
];

export default function ImportView({ onImported }: { onImported: () => void }) {
  const [step, setStep] = useState<Step>('spreadsheet');

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
            <Upload size={24} className="text-brand-strong" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Importar Peças</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Importe a planilha padrão (Excel) com os itens e depois envie as fotos — cada imagem é vinculada à peça
          pelo código no nome do arquivo.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        {steps.map((s) => {
          const Icon = s.icon;
          const active = step === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                active
                  ? 'border-brand bg-brand/10 shadow-sm'
                  : 'border-border bg-card hover:border-brand/60'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                  active ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {s.number}
              </div>
              <div className="flex-1">
                <p className={`font-semibold ${active ? 'text-brand-strong' : 'text-foreground'}`}>{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
              <Icon size={22} className={active ? 'text-brand-strong' : 'text-muted-foreground/60'} />
            </button>
          );
        })}
      </div>

      {step === 'spreadsheet' ? (
        <SpreadsheetImport onImported={onImported} onGoToImages={() => setStep('images')} />
      ) : (
        <ImageImport onImported={onImported} />
      )}
    </div>
  );
}
