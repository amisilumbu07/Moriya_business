import { Suspense } from "react";
import ProductBatches from "./ProductBatches";

async function Batches({ params }: PageProps<"/inventory/[id]">) {
  const { id } = await params;
  return <ProductBatches id={id} />;
}

export default function Page(props: PageProps<"/inventory/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm opacity-70">Loading…</p>}>
      <Batches {...props} />
    </Suspense>
  );
}
