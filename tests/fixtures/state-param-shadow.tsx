export function Counter() {
  const [count, setCount] = useState(0);
  function handle(count: number) {
    return count + 1;
  }
  return <div>{handle(1)}</div>;
}
