export type Activity = {
  id: string;
  title: string;
  type: 'FIXED' | 'FLEXIBLE';
  durationMinutes?: number;
  timeWindow: {
    start: string | null;
    end: string | null;
  };
  location: {
    name: string;
    latitude: number;
    longitude: number;
  };
  date: string;
  isAlways?: boolean;
  isPoiSelector?: boolean;
  poiQuery?: string;
};

export type MapNode = {
  id: string;
  lat: number;
  lng: number;
  hasTrafficLight: boolean;
};

export type MapEdge = {
  from: string;
  to: string;
  distance: number;
  weight: number;
  condition: 'normal' | 'jam' | 'incident';
};

export type MapFeature = {
  type: 'river' | 'park' | 'railway';
  path: string;
  color: string;
};
