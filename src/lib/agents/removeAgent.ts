// Asks first, then deletes the agent and its run history. Resolves true once
// the agent is gone.
export async function removeAgent(agent: { id: string; name: string }): Promise<boolean> {
  if (!window.confirm(`Remove ${agent.name}? Its run history goes too.`)) return false;
  const res = await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    window.alert(`Couldn't remove ${agent.name}. Try again.`);
    return false;
  }
  return true;
}
