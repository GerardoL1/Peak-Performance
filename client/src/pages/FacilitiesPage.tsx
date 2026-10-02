import { useQuery } from '@tanstack/react-query';
import { describeError, get } from '../api/client';
import type { Facility, Room } from '../api/types';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/Layout';

const facilityIcon: Record<string, string> = {
  'Exercise Area': '🏋️',
  Studio: '🎵',
  Therapy: '🩺',
};

export function FacilitiesPage() {
  const facilities = useQuery({ queryKey: ['/facilities'], queryFn: () => get<Facility[]>('/facilities') });
  const rooms = useQuery({ queryKey: ['/rooms'], queryFn: () => get<Room[]>('/rooms') });

  return (
    <div>
      <PageHeader title="Facilities & rooms" count={facilities.data?.length} />

      {facilities.error && (
        <p className="alert" role="alert">
          {describeError(facilities.error)}
        </p>
      )}
      <div className="facilities-grid">
        {facilities.data?.map((f) => (
          <article key={f.FacilityID} className="facility-card">
            <div className="facility-type">
              <span aria-hidden="true">{facilityIcon[f.FacilityType] ?? '🏢'}</span> {f.FacilityType}
            </div>
            <h2>{f.FacilityName}</h2>
            <p>{f.FacilityDescription}</p>
            <p className="facility-rooms">{f.RoomCount} room(s)</p>
          </article>
        ))}
      </div>

      <h2 className="section-title">Rooms</h2>
      <DataTable
        caption="Rooms"
        rows={rooms.data}
        rowKey={(r) => r.RoomID}
        loading={rooms.isLoading}
        error={rooms.error ? describeError(rooms.error) : null}
        columns={[
          { header: 'Room', cell: (r) => <strong>Room {r.RoomNumber}</strong> },
          { header: 'Capacity', cell: (r) => `${r.Capacity} people` },
          { header: 'Facility', cell: (r) => <span className="badge badge-blue">{r.FacilityName}</span> },
        ]}
      />
    </div>
  );
}
