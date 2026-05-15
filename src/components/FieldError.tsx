interface Props {
  message?: string;
}

function FieldError({ message }: Props) {
  return (
    <div className="relative h-0">
      {message && (
        <p className="pointer-events-none absolute top-0 left-0 mt-1 text-xs leading-tight font-medium text-danger max-[360px]:text-[9px]">
          {message}
        </p>
      )}
    </div>
  );
}

export default FieldError;
