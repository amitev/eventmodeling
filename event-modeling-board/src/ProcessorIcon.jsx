import { DEFAULT_PROCESSOR_ICON, PROCESSOR_ICONS } from './model/model.js';

const cogPath = (() => {
  const teeth = 8, step = (2 * Math.PI) / teeth, outer = 48, root = 38, hole = 15;
  const pt = (r, a) => `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    pts.push(pt(root, a - 0.3 * step), pt(outer, a - 0.17 * step), pt(outer, a + 0.17 * step), pt(root, a + 0.3 * step));
  }
  return `M${pts.join('L')}ZM${50 + hole} 50A${hole} ${hole} 0 1 0 ${50 - hole} 50A${hole} ${hole} 0 1 0 ${50 + hole} 50Z`;
})();

function drawing(name) {
  switch (name) {
    case 'envelope':
      return <><rect x="14" y="24" width="72" height="52" rx="5" /><path d="m16 28 34 27 34-27" /></>;
    case 'chat':
      return <><path d="M17 18h66a6 6 0 0 1 6 6v42a6 6 0 0 1-6 6H49L29 88V72h-12a6 6 0 0 1-6-6V24a6 6 0 0 1 6-6Z" /><path d="M31 45h2m16 0h2m16 0h2" strokeWidth="10" strokeLinecap="round" /></>;
    case 'bell':
      return <><path d="M20 70h60l-8-10V43a22 22 0 0 0-44 0v17Z" /><path d="M42 81a9 9 0 0 0 16 0" /></>;
    case 'phone':
      return <path fill="currentColor" stroke="none" d="M25 14c-5 0-10 5-10 11 0 29 31 60 60 60 6 0 11-5 11-10V62L65 54 55 65c-9-4-16-11-20-20l11-10-8-21Z" />;
    case 'clock':
      return <><circle cx="50" cy="50" r="36" /><path d="M50 27v25l17 11" /></>;
    case 'calendar':
      return <><rect x="15" y="22" width="70" height="64" rx="5" /><path d="M15 40h70M32 14v16m36-16v16" /><path d="M31 54h8m12 0h8m12 0h4M31 69h8m12 0h8" /></>;
    case 'credit-card':
      return <><rect x="12" y="24" width="76" height="52" rx="6" /><path d="M13 40h74M24 61h23" /></>;
    case 'file':
      return <><path d="M27 12h32l18 18v58H27z" /><path d="M59 12v20h18M39 49h26M39 62h26M39 75h18" /></>;
    case 'pdf':
      return <><path d="M27 12h32l18 18v58H27z" /><path d="M59 12v20h18" /><text x="50" y="65" textAnchor="middle" stroke="none" fill="currentColor" fontSize="19" fontWeight="700">PDF</text></>;
    case 'table':
      return <><rect x="13" y="17" width="74" height="66" rx="3" /><path d="M13 39h74M13 61h74M38 17v66M63 17v66" /></>;
    case 'printer':
      return <><path d="M30 30V14h40v16m0 40v16H30V70" /><path d="M18 34h64a6 6 0 0 1 6 6v27H70M30 67H12V40a6 6 0 0 1 6-6Z" /><path d="M32 56h36v18H32z" /><circle cx="73" cy="45" r="2" fill="currentColor" /></>;
    case 'refresh':
      return <><path d="M78 42a29 29 0 0 0-51-13L17 39m0 0V20m0 19h19M22 58a29 29 0 0 0 51 13l10-10m0 0v19m0-19H64" /></>;
    case 'diamonds':
      return <><path d="m50 12 16 16-16 16-16-16zM28 34l16 16-16 16-16-16zm44 0 16 16-16 16-16-16zM50 56l16 16-16 16-16-16z" /></>;
    case 'cloud':
      return <path d="M28 75h45a18 18 0 0 0 0-36 25 25 0 0 0-48-4 20 20 0 0 0 3 40Z" />;
    case 'bolt':
      return <path fill="currentColor" stroke="none" d="M57 8 23 54h22l-5 38 37-52H54Z" />;
    case 'truck':
      return <><path d="M10 28h48v42H10zM58 43h19l14 15v12H58z" /><circle cx="29" cy="73" r="8" /><circle cx="73" cy="73" r="8" /></>;
    case 'gear':
    default:
      return <path d={cogPath} fill="var(--processor)" fillRule="evenodd" stroke="rgba(0,0,0,0.45)" strokeWidth="1.5" />;
  }
}

export function ProcessorIcon({ name = DEFAULT_PROCESSOR_ICON, size = 88, className }) {
  const known = PROCESSOR_ICONS.some((icon) => icon.name === name);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {drawing(known ? name : DEFAULT_PROCESSOR_ICON)}
    </svg>
  );
}
