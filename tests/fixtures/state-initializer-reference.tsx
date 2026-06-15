export function Outer() {
  const [count, setCount] = useState(0);
  function Inner() {
    const [value, setValue] = useState(count);
    return <div>{value}</div>;
  }
  return <Inner />;
}
