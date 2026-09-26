import { ComingSoon } from '../../components/ComingSoon';

export function PlannerPage() {
  return (
    <ComingSoon
      title="Cover the week before it starts"
      body="Line up next week's freight against the drivers, trucks and hours you actually have, so loads are covered before the phone starts ringing."
      items={[
        'Capacity by day: drivers, power units and trailers available',
        'Unassigned loads with suggested driver and equipment pairings',
        'Hours-of-service check before a driver is committed',
        'Lane planning with deadhead and reload estimates',
      ]}
      figure="Weekly planning board"
    />
  );
}
