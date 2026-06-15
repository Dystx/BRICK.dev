export function Outer() {
  const [count, setCount] = useState(0);
  function Inner() {
    return <div>{count}</div>;
  }
  return <Inner />;
}
