import LivePanel from '@/components/LivePanel';

export const metadata = { title: 'Live · Funnel Intelligence' };

export default function Live() {
  return (
    <>
      <h1>Live tracking</h1>
      <p className="lede">
        The other pages analyse 13 weeks of synthetic events and 12 months of synthetic orders. This one shows real visitors to the demo store as they arrive: which analytics tools receive the events,
        the live funnel and conversion, and the events themselves.
      </p>
      <LivePanel />
      <section className="section card small">
        <h2>How to verify it yourself</h2>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li>Open the <a href="/store?utm_source=portfolio">store</a> in another tab and open its &ldquo;Data layer&rdquo; panel.</li>
          <li>View a product, add it to the cart, check out. Each event lists the destinations that accepted it.</li>
          <li>Come back here: the last-hour funnel moves within 10 seconds.</li>
          <li>In Mixpanel, open Events and filter <code>utm_source = portfolio</code>: the same events, same properties.</li>
        </ol>
      </section>
    </>
  );
}
