import type { ReactNode } from 'react';
export function EntryMessageList({
  items,
  empty,
}: {
  items: readonly {
    id: string;
    subject: string;
    recipient: string;
    time: string;
    dateTime: string;
    status: ReactNode;
    template: string;
  }[];
  empty: ReactNode;
}) {
  return items.length ? (
    <ol className="nb-entry-message-list">
      {items.map((item) => (
        <li key={item.id}>
          <div>
            <strong>{item.subject}</strong>
            <time dateTime={item.dateTime}>{item.time}</time>
          </div>
          <p>an {item.recipient}</p>
          <span>{item.status}</span>
          <small>Vorlage: {item.template}</small>
        </li>
      ))}
    </ol>
  ) : (
    empty
  );
}
