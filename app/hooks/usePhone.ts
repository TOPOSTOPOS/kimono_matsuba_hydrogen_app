import {useEffect, useState} from 'react';

const useIsPhone = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(window.innerWidth < 640);
  }, []);
  return isMobile;
};

export default useIsPhone;
