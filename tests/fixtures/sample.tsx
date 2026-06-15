export function Button() {
  return <button className="flex items-center justify-center">Click</button>;
}

export function Form() {
  const [value, setValue] = useState('');
  return <input value={value} onChange={(e) => setValue(e.target.value)} />;
}
