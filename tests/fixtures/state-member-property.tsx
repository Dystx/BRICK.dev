export function Counter() {
  const [target, setTarget] = useState(0);
  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const x = e.target.value;
    return x;
  }
  return <input onChange={handle} />;
}
