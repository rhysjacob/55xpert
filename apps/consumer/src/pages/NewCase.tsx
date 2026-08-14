import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { Layout } from '../components/ui/Layout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import type { Case, Vehicle, VehicleLookupResponse } from '@corexpert/core';

const STEPS = ['Vehicle', 'Details', 'Images', 'Review'];

const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/heic';

/**
 * A file picker that looks like a button.
 *
 * A bare <input type="file"> renders as the browser's own control — small grey
 * "Choose File" text that reads as a caption rather than the main action on the
 * step. The input is still the control (label-wrapped, so a click anywhere on
 * the button opens the picker); only its appearance is ours. `sr-only` rather
 * than `hidden` keeps it focusable, and `focus-within` puts the ring on the
 * button the user can actually see.
 */
function FilePickerButton({
  label,
  onFiles,
  variant,
  multiple = false,
}: {
  label: string;
  onFiles: (files: File[]) => void;
  variant: 'primary' | 'secondary';
  multiple?: boolean;
}) {
  const styles =
    variant === 'primary'
      ? 'bg-brand text-white hover:bg-brand-dark px-6 py-3 text-base'
      : 'bg-gray-100 text-gray-900 hover:bg-gray-200 px-4 py-2 text-sm';

  return (
    <label
      className={`inline-flex cursor-pointer items-center justify-center rounded-lg font-medium transition-colors focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2 ${styles}`}
    >
      <input
        type="file"
        multiple={multiple}
        accept={ACCEPTED_IMAGE_TYPES}
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          // Clear it so picking the same file again still fires a change event.
          e.target.value = '';
        }}
      />
      {label}
    </label>
  );
}

export function NewCasePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [registrationNo, setRegistrationNo] = useState('');
  const [vehicle, setVehicle] = useState<Vehicle | undefined>();
  const [postcode, setPostcode] = useState('');
  const [incidentDate, setIncidentDate] = useState('');
  const [incidentNotes, setIncidentNotes] = useState('');
  const [caseId, setCaseId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<Record<string, 'pending' | 'uploading' | 'done'>>({
    REGISTRATION_PLATE: 'pending',
    DAMAGE_ANGLE_1: 'pending',
    DAMAGE_ANGLE_2: 'pending',
    DAMAGE_ANGLE_3: 'pending',
  });

  const lookupMutation = useMutation({
    mutationFn: () => api.post<VehicleLookupResponse>('/api/v1/vehicles/lookup', { registrationNo }),
    onSuccess: (data) => {
      if (data.found && data.vehicle) {
        setVehicle(data.vehicle);
      }
    },
  });

  const createCaseMutation = useMutation({
    mutationFn: () =>
      api.post<Case>('/api/v1/cases', {
        postcode,
        incidentDate: incidentDate || undefined,
        incidentNotes: incidentNotes || undefined,
        vehicle,
      }),
    onSuccess: (data) => {
      setCaseId(data.caseId);
      setStep(2);
    },
  });

  const triageMutation = useMutation({
    // Triage runs asynchronously: this returns quickly with TRIAGE_PENDING and
    // the results page polls for completion.
    mutationFn: () => api.post<{ caseId: string; status: string }>(`/api/v1/cases/${caseId}/triage`),
    onSuccess: () => {
      navigate(`/cases/${caseId}/triage`);
    },
  });

  const handleImageUpload = async (imageType: string, file: File) => {
    if (!caseId) return;

    setUploadStatus((prev) => ({ ...prev, [imageType]: 'uploading' }));

    try {
      // 1. Get presigned URL
      const presigned = await api.post<{
        uploadUrl: string;
        s3Key: string;
        s3Bucket: string;
      }>(`/api/v1/cases/${caseId}/images/presigned-url`, {
        imageType,
        mimeType: file.type,
        originalFilename: file.name,
      });

      // 2. Upload to S3
      await fetch(presigned.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      // 3. Confirm upload
      await api.post(`/api/v1/cases/${caseId}/images/confirm`, {
        imageType,
        s3Key: presigned.s3Key,
        s3Bucket: presigned.s3Bucket,
        originalFilename: file.name,
        mimeType: file.type,
      });

      setUploadStatus((prev) => ({ ...prev, [imageType]: 'done' }));
    } catch {
      setUploadStatus((prev) => ({ ...prev, [imageType]: 'pending' }));
    }
  };

  // Distribute a multi-file selection across the still-empty slots, in order.
  const IMAGE_SLOTS = ['REGISTRATION_PLATE', 'DAMAGE_ANGLE_1', 'DAMAGE_ANGLE_2', 'DAMAGE_ANGLE_3'] as const;
  const handleFiles = (files: File[] | FileList) => {
    const openSlots = IMAGE_SLOTS.filter((t) => uploadStatus[t] === 'pending');
    Array.from(files)
      .slice(0, openSlots.length)
      .forEach((file, i) => handleImageUpload(openSlots[i]!, file));
  };

  const allUploaded = Object.values(uploadStatus).every((s) => s === 'done');
  const openSlotCount = Object.values(uploadStatus).filter((s) => s === 'pending').length;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* Progress steps */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((name, i) => (
            <div key={name} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  i <= step ? 'bg-brand text-white' : 'chip-idle'
                }`}
              >
                {i + 1}
              </div>
              <span className={`ml-2 text-sm ${i <= step ? 'text-on-app' : 'text-on-app-muted'}`}>
                {name}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`w-12 h-0.5 mx-3 ${i < step ? 'bg-brand' : 'rule-idle'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Vehicle */}
        {step === 0 && (
          <Card>
            <CardHeader><h2 className="text-lg font-semibold">Vehicle Details</h2></CardHeader>
            <CardBody className="space-y-4">
              <div className="flex gap-3">
                <Input
                  label="Registration number"
                  value={registrationNo}
                  onChange={(e) => setRegistrationNo(e.target.value.toUpperCase())}
                  placeholder="e.g. AB12CDE"
                  className="flex-1"
                />
                <div className="pt-6">
                  <Button
                    onClick={() => lookupMutation.mutate()}
                    loading={lookupMutation.isPending}
                    variant="secondary"
                  >
                    Look up
                  </Button>
                </div>
              </div>
              {vehicle && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-1">
                  <p className="font-medium text-green-800">Vehicle found</p>
                  <p className="text-sm text-green-700">
                    {vehicle.year} {vehicle.make} {vehicle.model}
                    {vehicle.variant ? ` ${vehicle.variant}` : ''}
                  </p>
                  <p className="text-sm text-green-700">
                    Colour: {vehicle.colour} | Size: {vehicle.vehicleSize}
                  </p>
                </div>
              )}
              {lookupMutation.isSuccess && !lookupMutation.data?.found && (
                <p className="text-sm text-yellow-600">
                  Vehicle not found. You can continue with manual entry.
                </p>
              )}
              <div className="flex justify-end">
                <Button onClick={() => setStep(1)} disabled={!registrationNo}>
                  Next
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Step 2: Incident details */}
        {step === 1 && (
          <Card>
            <CardHeader><h2 className="text-lg font-semibold">Incident Details</h2></CardHeader>
            <CardBody className="space-y-4">
              <Input
                label="Your postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                placeholder="e.g. SW1A 1AA"
                required
              />
              <Input
                label="Incident date"
                type="date"
                value={incidentDate}
                onChange={(e) => setIncidentDate(e.target.value)}
              />
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Notes (optional)</label>
                <textarea
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  value={incidentNotes}
                  onChange={(e) => setIncidentNotes(e.target.value)}
                  placeholder="Describe what happened..."
                />
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
                <Button
                  onClick={() => createCaseMutation.mutate()}
                  loading={createCaseMutation.isPending}
                  disabled={!postcode}
                >
                  Next
                </Button>
              </div>
              {createCaseMutation.isError && (
                <p className="text-sm text-red-600">
                  {createCaseMutation.error.message}
                </p>
              )}
            </CardBody>
          </Card>
        )}

        {/* Step 3: Image upload */}
        {step === 2 && (
          <Card>
            <CardHeader><h2 className="text-lg font-semibold">Upload Images</h2></CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm text-gray-500">
                Upload 4 images of your vehicle damage for AI assessment. You can select
                several at once and they'll fill the empty slots below in order.
              </p>

              {openSlotCount > 0 && (
                <div className="border-2 border-dashed border-blue-300 bg-blue-50 rounded-lg p-6 text-center">
                  <p className="text-sm font-medium text-gray-700 mb-3">
                    {openSlotCount} slot{openSlotCount === 1 ? '' : 's'} remaining
                  </p>
                  <FilePickerButton
                    multiple
                    variant="primary"
                    label="Choose photos"
                    onFiles={(files) => handleFiles(files)}
                  />
                  <p className="text-xs text-gray-500 mt-3">
                    JPG, PNG, WEBP or HEIC
                  </p>
                </div>
              )}

              {(['REGISTRATION_PLATE', 'DAMAGE_ANGLE_1', 'DAMAGE_ANGLE_2', 'DAMAGE_ANGLE_3'] as const).map((type) => {
                const labels: Record<string, string> = {
                  REGISTRATION_PLATE: 'Registration plate (clear photo)',
                  DAMAGE_ANGLE_1: 'Damage photo - Angle 1 (wide shot)',
                  DAMAGE_ANGLE_2: 'Damage photo - Angle 2 (close up)',
                  DAMAGE_ANGLE_3: 'Damage photo - Angle 3 (context)',
                };
                const status = uploadStatus[type];

                return (
                  <div
                    key={type}
                    className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                      status === 'done' ? 'border-green-300 bg-green-50' :
                      status === 'uploading' ? 'border-blue-300 bg-blue-50' :
                      'border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-700 mb-2">{labels[type]}</p>
                    {status === 'done' ? (
                      <p className="text-sm text-green-600">Uploaded</p>
                    ) : status === 'uploading' ? (
                      <p className="text-sm text-blue-600">Uploading...</p>
                    ) : (
                      <FilePickerButton
                        variant="secondary"
                        label="Choose file"
                        onFiles={(files) => {
                          const file = files[0];
                          if (file) handleImageUpload(type, file);
                        }}
                      />
                    )}
                  </div>
                );
              })}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => setStep(3)} disabled={!allUploaded}>
                  Review
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Step 4: Review */}
        {step === 3 && (
          <Card>
            <CardHeader><h2 className="text-lg font-semibold">Review & Submit</h2></CardHeader>
            <CardBody className="space-y-4">
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Vehicle</p>
                  <p className="font-medium">
                    {vehicle?.year} {vehicle?.make} {vehicle?.model} ({registrationNo})
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Postcode</p>
                  <p className="font-medium">{postcode}</p>
                </div>
                {incidentDate && (
                  <div>
                    <p className="text-sm text-gray-500">Incident date</p>
                    <p className="font-medium">{incidentDate}</p>
                  </div>
                )}
                {incidentNotes && (
                  <div>
                    <p className="text-sm text-gray-500">Notes</p>
                    <p className="font-medium">{incidentNotes}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500">Images</p>
                  <p className="font-medium">4 images uploaded</p>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  Submitting will trigger an AI assessment of your damage. This usually takes under a minute.
                </p>
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                <Button
                  onClick={() => triageMutation.mutate()}
                  loading={triageMutation.isPending}
                >
                  Submit for Assessment
                </Button>
              </div>
              {triageMutation.isError && (
                <p className="text-sm text-red-600">{triageMutation.error.message}</p>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </Layout>
  );
}
