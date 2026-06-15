export function Form() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  return (
    <div>
      <p>{name}</p>
      <button onClick={() => setEmail('x')}>Set</button>
    </div>
  );
}
