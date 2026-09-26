import { ComingSoon } from '../../components/ComingSoon';

export function SafetyPage() {
  return (
    <ComingSoon
      title="Compliance that raises its own hand"
      body="Driver qualification files, inspections and incidents in one place, with expirations flagged before they become a roadside problem."
      items={[
        'Driver qualification files: CDL, medical card, MVR and annual review',
        'Roadside inspections and CSA scores by driver and unit',
        'Accident and incident reports with follow-up actions',
        'Drug and alcohol testing program and Clearinghouse queries',
      ]}
      figure="Compliance calendar"
    />
  );
}
