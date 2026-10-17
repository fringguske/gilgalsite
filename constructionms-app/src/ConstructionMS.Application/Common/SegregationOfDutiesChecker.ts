/** Pure helpers for actor-level segregation-of-duties checks. */
export const SegregationOfDutiesChecker = Object.freeze({
  isSameUser(actorAId: number, actorBId: number): boolean {
    return actorAId === actorBId
  },

  getViolationMessage(actorARole: string, actorBRole: string): string {
    return `Segregation of duties violation: the ${actorARole} and the ${actorBRole} ` +
      'cannot be the same user. Please assign a different user to perform this action.'
  },
})
