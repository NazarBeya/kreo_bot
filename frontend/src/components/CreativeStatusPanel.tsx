import React, { useState } from 'react';
import apiClient from '../api';

type BuyerStatus = 'testing' | 'working' | 'fading' | 'dead' | 'resurrected';
type TestVolume = 'quick' | 'decent' | 'heavy';
type RoiCategory = 'green' | 'yellow' | 'red';

interface CreativeStatusPanelProps {
  creativeId: string;
  geos: string[];
  onUpdated: () => void;
}

export const CreativeStatusPanel: React.FC<CreativeStatusPanelProps> = ({
  creativeId,
  geos,
  onUpdated,
}) => {
  const [geoCode, setGeoCode] = useState(geos[0] || 'DE');
  const [status, setStatus] = useState<BuyerStatus>('testing');
  const [testVolume, setTestVolume] = useState<TestVolume>('quick');
  const [roiCategory, setRoiCategory] = useState<RoiCategory>('green');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await apiClient.post('/api/status', {
        creativeId,
        geoCode,
        status,
        testVolume,
        roiCategory,
        comment: comment.trim() || undefined,
      });
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="status-form">
      <h3>поставити статус</h3>
      <label>
        <span>ГЕО</span>
        <select value={geoCode} onChange={(event) => setGeoCode(event.target.value)}>
          {geos.map((geo) => <option key={geo} value={geo}>{geo}</option>)}
          {!geos.length && <option value="DE">DE</option>}
        </select>
      </label>
      <label>
        <span>статус</span>
        <select value={status} onChange={(event) => setStatus(event.target.value as BuyerStatus)}>
          <option value="testing">тестую</option>
          <option value="working">працює</option>
          <option value="fading">вигорає</option>
          <option value="dead">помер</option>
          <option value="resurrected">воскрес</option>
        </select>
      </label>
      <label>
        <span>обсяг</span>
        <select value={testVolume} onChange={(event) => setTestVolume(event.target.value as TestVolume)}>
          <option value="quick">quick (&lt;$100)</option>
          <option value="decent">decent ($100-$1000)</option>
          <option value="heavy">heavy (&gt;$1000)</option>
        </select>
      </label>
      <label>
        <span>ROI</span>
        <select value={roiCategory} onChange={(event) => setRoiCategory(event.target.value as RoiCategory)}>
          <option value="green">+</option>
          <option value="yellow">~0</option>
          <option value="red">-</option>
        </select>
      </label>
      <input
        placeholder="коментар (опціонально)"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
      <button disabled={saving} onClick={() => void submit()}>
        {saving ? 'зберігаю...' : 'спробую / оновити статус'}
      </button>
    </section>
  );
};
