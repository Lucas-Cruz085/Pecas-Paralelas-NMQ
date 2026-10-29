import { useState } from 'react';
import { LOGO_HORIZONTAL, LOGO_ICONE, NOME_EMPRESA } from '@/config/portal';

/** Logo horizontal sobre fundo branco; se o arquivo não existir, mostra o nome da empresa. */
export function LogoHorizontal({ className = '' }: { className?: string }) {
  const [falhou, setFalhou] = useState(!LOGO_HORIZONTAL);
  return (
    <div className={`flex h-11 items-center justify-center rounded-xl bg-white px-3 ${className}`}>
      {falhou ? (
        <span className="text-lg font-extrabold tracking-[0.18em] text-[oklch(0.21_0.04_265)]">{NOME_EMPRESA}</span>
      ) : (
        <img src={LOGO_HORIZONTAL} alt={NOME_EMPRESA} className="h-8 w-auto object-contain" onError={() => setFalhou(true)} />
      )}
    </div>
  );
}

export function LogoIcone({ className = '' }: { className?: string }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) {
    return (
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-sm font-extrabold text-brand-foreground ${className}`}>
        {NOME_EMPRESA.charAt(0)}
      </span>
    );
  }
  return <img src={LOGO_ICONE} alt={NOME_EMPRESA} className={`h-10 w-10 rounded-xl object-contain ${className}`} onError={() => setFalhou(true)} />;
}
