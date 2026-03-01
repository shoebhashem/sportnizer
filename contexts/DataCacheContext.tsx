import React, { createContext, useContext, useRef } from "react";

export type DataCacheType = {
  get: (key: string) => any | undefined;
  set: (key: string, value: any) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const DataCacheContext = createContext<DataCacheType | undefined>(undefined);

export const DataCacheProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const cacheRef = useRef<{ [key: string]: any }>({});

  const get = (key: string) => cacheRef.current[key];
  const set = (key: string, value: any) => {
    cacheRef.current[key] = value;
  };
  const remove = (key: string) => {
    delete cacheRef.current[key];
  };
  const clear = () => {
    cacheRef.current = {};
  };

  return (
    <DataCacheContext.Provider value={{ get, set, remove, clear }}>
      {children}
    </DataCacheContext.Provider>
  );
};

export const useDataCache = (): DataCacheType => {
  const ctx = useContext(DataCacheContext);
  if (!ctx)
    throw new Error("useDataCache must be used within a DataCacheProvider");
  return ctx;
};
