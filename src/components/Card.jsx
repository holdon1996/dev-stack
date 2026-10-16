import React from 'react';

/** Titled panel with an optional description and header actions. */
const Card = ({ title, desc, children, actions }) => (
  <section className="bg-surface border border-border rounded-xl p-5">
    <div className="flex items-start gap-3 mb-4">
      <div className="flex-1">
        <h2 className="text-[13px] font-bold m-0">{title}</h2>
        {desc && <p className="text-[11px] text-muted m-0 mt-1">{desc}</p>}
      </div>
      {actions}
    </div>
    {children}
  </section>
);

export default Card;
