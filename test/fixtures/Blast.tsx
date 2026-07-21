import { useEffect, useState } from 'react';

function C({ items }) {
  const [total, setTotal] = useState(0);

  // component-level helper — must resolve in the decl table with a next-hop pointer
  function recompute() {
    return items.length;
  }

  // derived setState called INSIDE the effect...
  useEffect(() => {
    setTotal(recompute());
  }, [items]);

  // ...and ALSO outside it -> blast-radius warning
  const reset = () => setTotal(0);

  return null;
}
