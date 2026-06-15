export function Wrapper() {
  function helper() {
    return useId();
  }
  return <div>{helper()}</div>;
}
