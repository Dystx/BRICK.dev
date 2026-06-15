export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(1)}>increment</button>;
}
