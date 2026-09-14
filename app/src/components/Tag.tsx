export function Tag({ label, tagClass }: { label: string; tagClass: string }) {
  return <span className={`tag ${tagClass}`}>{label}</span>;
}
