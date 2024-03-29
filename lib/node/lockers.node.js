#!/usr/bin/env node
if (require.main == module) { console.error('Direct usage not permitted. Please use require.'); process.exit(9) }
// This module allows creation of lockers. Each locker is completely separate from the others. Once you have a locker, you can lock based on a string key. You can lock multiple times over with add. You can unlock one time over with unlock. It is important that for every call to lock you call unlock when you are done, or else there will be a memory leak. Same thing for add. If you call add, you must call unlock. To wait for all locks to unlock, call wait. To lock only when other locks are unlocked, call lock. To add (or remove) a lock regardless, use add.
module.exports = function () {
    var locks = {}
    var locker = {}
    locker.lock = lock
    locker.add = add
    locker.unlock = unlock
    locker.wait = wait
    return locker
    function lock(k, limit, callback) { // returns number of items that were in queue waiting on
        if(typeof limit == 'function') callback = limit, limit = 1
        return wait(k, limit-1, function () {
            add(k)
            callback()
        })
    }
    function add(key) {
        var k = ' ' + key
        if(locks[k])
            locks[k].count++
        else
            locks[k] = { count: 1, callbacks: [], callbackTargets: [], unlocking: false }
    }
    function unlock(key) {
        var k = ' ' + key
        locks[k].count--
        if(locks[k].unlocking) return
        locks[k].unlocking = true
        for(var i = 0; i < locks[k].callbackTargets.length; i++) {
            var target = locks[k].callbackTargets[i]
            if(locks[k].count <= target) {
                locks[k].callbackTargets.splice(i, 1)
                var callback = locks[k].callbacks.splice(i, 1)[0]
                callback()
                i = -1 // Start over because the callback may have changed some stuff while we were not looking.
            }
        }
        if(locks[k].count == 0) delete locks[k]
        else locks[k].unlocking = false
    }
    function wait(k, target, callback) {
        if(typeof target == 'function') callback = target, target = 0
        k = ' ' + k
        if(locks[k]) {
            var queued = locks[k].count - target
            if(queued > 0) {
                locks[k].callbacks.push(callback)
                locks[k].callbackTargets.push(target)
            } else
                callback()
            return queued
        } else {
            callback()
            return 0
        }
    }
}
