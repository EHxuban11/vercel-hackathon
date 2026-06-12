"use client";

import { useEffect, useState } from "react";

export default function LogoutButton() {
  const [show, setShow] = useState(false);
  const [auth0, setAuth0] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("pj_name")) setShow(true);
    fetch("/auth/profile")
      .then((res) => {
        if (res.ok) {
          setAuth0(true);
          setShow(true);
        }
      })
      .catch(() => {});
  }, []);

  if (!show) return null;

  function logout() {
    localStorage.removeItem("pj_name");
    window.location.href = auth0 ? "/auth/logout" : "/";
  }

  return (
    <button
      onClick={logout}
      className="text-sm text-zinc-500 hover:text-red-400 transition-colors"
      title="Log out"
    >
      Log out
    </button>
  );
}
