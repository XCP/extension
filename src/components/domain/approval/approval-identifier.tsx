/** A full, copyable identifier with a balanced wrap point and no inserted characters. */
export function ApprovalIdentifier({ value, className = '' }: { value: string; className?: string }) {
  const midpoint = Math.ceil(value.length / 2);
  return (
    <span className={`font-mono text-xs leading-normal break-normal [overflow-wrap:anywhere] ${className}`}>
      {value.slice(0, midpoint)}<wbr />{value.slice(midpoint)}
    </span>
  );
}
