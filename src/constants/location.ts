export const searchRadiusOptions = [5, 10, 25, 50, 100] as const;

export type ManualLocationOption = {
  label: string;
  city: string;
  state: string;
  zipCode: string;
  latitude: number;
  longitude: number;
  aliases: readonly string[];
};

export const manualLocationOptions: readonly ManualLocationOption[] = [
  {
    label: 'Austin',
    city: 'Austin',
    state: 'TX',
    zipCode: '78701',
    latitude: 30.2672,
    longitude: -97.7431,
    aliases: ['78701', '78702', '78703', '78704', '78745', '78758'],
  },
  {
    label: 'Round Rock',
    city: 'Round Rock',
    state: 'TX',
    zipCode: '78664',
    latitude: 30.5083,
    longitude: -97.6789,
    aliases: ['78664', '78665', '78681'],
  },
  {
    label: 'Cedar Park',
    city: 'Cedar Park',
    state: 'TX',
    zipCode: '78613',
    latitude: 30.5052,
    longitude: -97.8203,
    aliases: ['78613', 'anderson mill'],
  },
  {
    label: 'Pflugerville',
    city: 'Pflugerville',
    state: 'TX',
    zipCode: '78660',
    latitude: 30.4394,
    longitude: -97.62,
    aliases: ['78660'],
  },
  {
    label: 'Georgetown',
    city: 'Georgetown',
    state: 'TX',
    zipCode: '78626',
    latitude: 30.6333,
    longitude: -97.6779,
    aliases: ['78626', '78628', '78633'],
  },
  {
    label: 'Leander',
    city: 'Leander',
    state: 'TX',
    zipCode: '78641',
    latitude: 30.5788,
    longitude: -97.8531,
    aliases: ['78641'],
  },
  {
    label: 'Buda',
    city: 'Buda',
    state: 'TX',
    zipCode: '78610',
    latitude: 30.0852,
    longitude: -97.8403,
    aliases: ['78610'],
  },
  {
    label: 'Kyle',
    city: 'Kyle',
    state: 'TX',
    zipCode: '78640',
    latitude: 29.9891,
    longitude: -97.8772,
    aliases: ['78640'],
  },
  {
    label: 'San Marcos',
    city: 'San Marcos',
    state: 'TX',
    zipCode: '78666',
    latitude: 29.8833,
    longitude: -97.9414,
    aliases: ['78666'],
  },
  {
    label: 'Dripping Springs',
    city: 'Dripping Springs',
    state: 'TX',
    zipCode: '78620',
    latitude: 30.1902,
    longitude: -98.0867,
    aliases: ['78620'],
  },
  {
    label: 'Bastrop',
    city: 'Bastrop',
    state: 'TX',
    zipCode: '78602',
    latitude: 30.1105,
    longitude: -97.3153,
    aliases: ['78602'],
  },
] as const;

export function findManualLocationByZipCode(zipCode: string): ManualLocationOption | undefined {
  const normalizedZip = zipCode.trim();

  if (!normalizedZip) {
    return undefined;
  }

  return manualLocationOptions.find((option) => option.zipCode === normalizedZip || option.aliases.includes(normalizedZip));
}
