const alertCopy = {
  expired: {
    title: "Expired membership",
    tone: "danger"
  },
  expiring: {
    title: "Plan ending soon",
    tone: "warning"
  }
};

export default function Notifications({ alerts, loading, error }) {
  if (loading) {
    return <div className="panel-empty">Loading membership alerts...</div>;
  }

  if (error) {
    return <div className="panel-empty panel-empty--error">{error}</div>;
  }

  if (!alerts.length) {
    return (
      <div className="panel-empty">
        No renewal alerts right now. Everyone looks on track.
      </div>
    );
  }

  return (
    <div className="alert-list">
      {alerts.map((alert, index) => {
        const config = alertCopy[alert.type] || alertCopy.expiring;

        return (
          <article
            key={`${alert.name}-${index}`}
            className={`alert-card alert-card--${config.tone}`}
          >
            <span className={`badge badge--${config.tone}`}>{config.title}</span>
            <h4>{alert.name}</h4>
          </article>
        );
      })}
    </div>
  );
}
