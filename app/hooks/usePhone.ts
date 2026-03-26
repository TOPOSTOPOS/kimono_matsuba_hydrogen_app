'use client';
import {useEffect, useState} from 'react';

const useIsPhone = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(window.innerWidth < 640);
  }, []);
  return window.innerWidth < 640;
};

export default useIsPhone;
