import React, { useEffect } from "react";
import { useNavigate , Link} from "react-router-dom";

const ProtectedRoute = ({ children }) => {
      const navigate = useNavigate();

       useEffect(() => {
    if (localStorage.getItem("token")) {
      navigate("/");
    } else {
      navigate("/login");
    }
  }, []);
  return (
   <div>{children}</div>
  )
}

export default ProtectedRoute