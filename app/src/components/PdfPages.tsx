import { PAGE_H, PAGE_W, type PdfDoc } from '../lib/pdf';

// Draws a PdfDoc's pages on screen as SVG: the same operations the PDF file
// is written from, so the preview matches the download.
export function PdfPages({ doc }: { doc: PdfDoc }) {
  return (
    <div className="ui-pdf-pages">
      {doc.pages.map((ops, p) => (
        <svg key={p} className="ui-pdf-page" viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} role="img" aria-label={`${doc.title}, page ${p + 1}`}>
          <rect x={0} y={0} width={PAGE_W} height={PAGE_H} fill="#ffffff" />
          {ops.map((op, i) => {
            if (op.t === 'text') {
              return (
                <text
                  key={i} x={op.x} y={op.y} fontSize={op.size} fontWeight={op.bold ? 700 : 400} fill={op.color}
                  fontFamily="Helvetica, Arial, sans-serif" style={{ whiteSpace: 'pre' }}
                >
                  {op.s}
                </text>
              );
            }
            if (op.t === 'line') return <line key={i} x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} stroke={op.color} strokeWidth={op.lw} />;
            return <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} fill={op.fill ?? 'none'} stroke={op.stroke} strokeWidth={op.stroke ? op.lw : 0} />;
          })}
        </svg>
      ))}
    </div>
  );
}
