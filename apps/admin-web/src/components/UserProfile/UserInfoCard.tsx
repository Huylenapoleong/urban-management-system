import { useEffect, useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { useModal } from '../../hooks/useModal';
import { locationsService } from '../../services/locations.service';
import Input from '../form/input/InputField';
import Label from '../form/Label';
import Button from '../ui/button/Button';
import { Modal } from '../ui/modal';

type ParsedLocation = {
  country: string;
  province: string;
  district: string;
  ward: string;
};

export default function UserAddressCard() {
  const { isOpen, openModal, closeModal } = useModal();
  const { currentUser: user } = useAuth();
  const [formData, setFormData] = useState({
    locationCode: user?.locationCode || '',
    unit: user?.unit || '',
  });
  const [saving, setSaving] = useState(false);
  const [resolvedLocation, setResolvedLocation] = useState<{
    displayName: string;
    province: string;
    ward: string;
  } | null>(null);

  useEffect(() => {
    const locationCode = user?.locationCode;

    if (!locationCode) {
      setResolvedLocation(null);
      return;
    }
    const resolvedLocationCode: string = locationCode;

    let active = true;

    async function loadResolvedLocation() {
      const response =
        await locationsService.resolveLocationCode(resolvedLocationCode);

      if (!active) {
        return;
      }

      if (response.success && response.data) {
        setResolvedLocation({
          displayName: response.data.displayName,
          province: response.data.province?.fullName || '—',
          ward: response.data.ward?.fullName || '—',
        });
      } else {
        setResolvedLocation(null);
      }
    }

    void loadResolvedLocation();

    return () => {
      active = false;
    };
  }, [user?.locationCode]);

  const handleSave = async () => {
    setSaving(true);
    try {
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  const parseLocation = (code?: string): ParsedLocation => {
    if (!code) {
      return { country: 'Vietnam', province: '—', district: '—', ward: '—' };
    }

    const normalized = code.trim().toUpperCase();
    const provinceMatch = normalized.match(/^VN-(\d{2})$/);
    const wardMatch = normalized.match(/^VN-(\d{2})-(\d{5})$/);

    if (provinceMatch) {
      return {
        country: 'Vietnam',
        province: provinceMatch[1],
        district: '—',
        ward: '—',
      };
    }

    if (wardMatch) {
      return {
        country: 'Vietnam',
        province: wardMatch[1],
        district: '—',
        ward: wardMatch[2],
      };
    }

    const parts = normalized.split('-');
    return {
      country: 'Vietnam',
      province: parts[1] ?? '—',
      district: parts[2] ?? '—',
      ward: parts[3] ?? '—',
    };
  };

  const parsedLocation = parseLocation(user?.locationCode);
  const loc = {
    country: 'Vietnam',
    province: resolvedLocation?.province || parsedLocation.province,
    district: '—',
    ward: resolvedLocation?.ward || parsedLocation.ward,
  };

  const InfoRow = ({ label, value }: { label: string; value?: string }) => (
    <div>
      <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
        {value || '—'}
      </p>
    </div>
  );

  return (
    <>
      <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1">
            <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-6">
              Location & Assignment
            </h4>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32">
              <InfoRow label="Country" value={loc.country} />
              <InfoRow label="Province / City" value={loc.province} />
              <InfoRow label="District" value={loc.district} />
              <InfoRow label="Ward" value={loc.ward} />
              {resolvedLocation?.displayName && (
                <InfoRow
                  label="Administrative Label"
                  value={resolvedLocation.displayName}
                />
              )}
              {user?.unit && (
                <InfoRow label="Assigned Unit" value={user.unit} />
              )}
            </div>
          </div>

          <button
            onClick={openModal}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/3 dark:hover:text-gray-200 lg:inline-flex lg:w-auto"
          >
            <svg
              className="fill-current"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M15.0911 2.78206C14.2125 1.90338 12.7878 1.90338 11.9092 2.78206L4.57524 10.116C4.26682 10.4244 4.0547 10.8158 3.96468 11.2426L3.31231 14.3352C3.25997 14.5833 3.33653 14.841 3.51583 15.0203C3.69512 15.1996 3.95286 15.2761 4.20096 15.2238L7.29355 14.5714C7.72031 14.4814 8.11172 14.2693 8.42013 13.9609L15.7541 6.62695C16.6327 5.74827 16.6327 4.32365 15.7541 3.44497L15.0911 2.78206ZM12.9698 3.84272C13.2627 3.54982 13.7376 3.54982 14.0305 3.84272L14.6934 4.50563C14.9863 4.79852 14.9863 5.2734 14.6934 5.56629L14.044 6.21573L12.3204 4.49215L12.9698 3.84272ZM11.2597 5.55281L5.6359 11.1766C5.53309 11.2794 5.46238 11.4099 5.43238 11.5522L5.01758 13.5185L6.98394 13.1037C7.1262 13.0737 7.25666 13.003 7.35947 12.9002L12.9833 7.27639L11.2597 5.55281Z"
                fill=""
              />
            </svg>
            Edit
          </button>
        </div>
      </div>

      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-175 m-4">
        <div className="relative w-full p-4 overflow-y-auto bg-white no-scrollbar rounded-3xl dark:bg-gray-900 lg:p-11">
          <div className="px-2 pr-14">
            <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              Edit Location
            </h4>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 lg:mb-7">
              Update your location and unit assignment.
            </p>
          </div>
          <form className="flex flex-col">
            <div className="px-2 space-y-5">
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                <div className="col-span-2 lg:col-span-1">
                  <Label>Administrative Label</Label>
                  <div className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400">
                    {resolvedLocation?.displayName || '—'}
                  </div>
                </div>
                <div className="col-span-2 lg:col-span-1">
                  <Label>Unit</Label>
                  <Input
                    type="text"
                    value={formData.unit}
                    onChange={(e) =>
                      setFormData({ ...formData, unit: e.target.value })
                    }
                    placeholder="e.g. Ward Police Unit 1"
                  />
                </div>

                <div>
                  <Label>Country</Label>
                  <div className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400">
                    Vietnam
                  </div>
                </div>
                <div>
                  <Label>Province</Label>
                  <div className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400">
                    {loc.province}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 px-2 mt-6 lg:justify-end">
              <Button size="sm" variant="outline" onClick={closeModal}>
                Close
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
