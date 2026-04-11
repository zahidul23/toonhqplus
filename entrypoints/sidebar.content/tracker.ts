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

export async function syncToonTracker(): Promise<ToonTrackerData> {
  const ports = ['1547', '1548', '1549', '1550', '1551', '1552', '1553', '1554'];

  return new Promise((resolve, reject) => {
    let connected = false;
    let attempts = 0;

    const tryConnect = (portIndex: number) => {
      if (portIndex >= ports.length) {
        reject(new Error('Could not connect to any Toontown local API ports.'));
        return;
      }

      const port = ports[portIndex];
      const ws = new WebSocket(`ws://localhost:${port}/`);
      let timeoutId: any;

      ws.onopen = () => {
        console.log(`WebSocket connected on port ${port}`);
        const randomKey = Math.random().toString(36).substring(2, 11);

        ws.send(JSON.stringify({
          authorization: randomKey,
          name: "ToonHQ+"
        }));

        ws.send(JSON.stringify({ request: "all" }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'authorize') {
            ws.send(JSON.stringify({ type: 'authorize', id: data.id }));
          }

          if (data.event === 'all' && data.data?.toon) {
            connected = true;
            if (timeoutId) clearTimeout(timeoutId);
            ws.close();
            resolve(data as ToonTrackerData);
          }
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      ws.onerror = () => {
        ws.close();
        if (timeoutId) clearTimeout(timeoutId);
        tryConnect(portIndex + 1);
      };

      timeoutId = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          tryConnect(portIndex + 1);
        }
      }, 1000);
    };

    tryConnect(0);
  });
}
