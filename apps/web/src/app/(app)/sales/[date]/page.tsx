import { Suspense } from "react";
import SalesEntry from "./SalesEntry";

async function Entry({ params }: PageProps<"/sales/[date]">) {
  const { date } = await params;
  return <SalesEntry date={date} />;
}

export default function Page(props: PageProps<"/sales/[date]">) {
  return (
    <Suspense fallback={<div className="skeleton h-64" />}>
      <Entry {...props} />
    </Suspense>
  );
}
