interface Props {
  message?: string;
}

function FieldError({ message }: Props) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-danger">{message}</p>;
}

export default FieldError;
