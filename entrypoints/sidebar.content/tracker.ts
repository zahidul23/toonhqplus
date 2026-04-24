export interface ToonTrackerData {
  event: string;
  data: {
    toon: {
      id: string;
      name: string;
      species: string;
      style: string;
    };
    laff: {
      current: number;
      max: number;
    };
    rewards?: {
      pinkslips: number;
      remotes: Record<string, Record<string, number>>;
      sos: Record<string, number>;
      summons: Record<string, { name: string; single: boolean; building: boolean; invasion: boolean }>;
      unites: Record<string, Record<string, number>>;
    };
    tasks: Array<{
      objective: {
        text: string;
        where: string;
        progress: {
          text: string;
          current: number;
          target: number;
        };
      };
      reward: string | null;
    }>;
    cogsuits: Record<string, {
      department: string;
      hasDisguise: boolean;
      suit?: { name: string };
      level: number;
      version?: number;
      promotion?: {
        current: number;
        target: number;
      };
    }>;
    location: Record<string, {
      district: string;
      neighborhood: string;
      instanceId: number;
      zone: string;
    }>;
  };
}

