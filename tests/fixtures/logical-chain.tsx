export function Conditional() {
  return res && res.data && res.data.user ? <div>yes</div> : null;
}
