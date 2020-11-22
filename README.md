# 700s-server
Embassy University's online server inspired by 700 Software's server setup and customized Node.js webserver

To take an on-instance snapshot. (backup against file deletions and mistakes etc., but not as good as backing up to a separate instance)
```sh
sudo zfs snap -r rpool/700s@`date +%Y-%m-%d-%H%M%S`
```

To take a backup of the packages area (e.g. doing a risky `pkgin` upgrade)
```sh
sudo zfs snap rpool/opt-local@`date +%Y-%m-%d-%H%M%S`
```


Expanding disk capacity
-----------------------

(I don't think you can shrink it without rebuilding the instance. You can always attach it as a new pool if you want to make it more removable)

To increase the size of the `rpool`

0. In AWS, identify the volume that is the current volume of your instance and take a snapshot of it just in case something wierd happens and you can't bring the box back up.

1. Create a new volume (probably general purpose SSD) with the desired capacity.

2. Attach your new volume to this running EC2 instance. (Device defaults to `/dev/sdf`.)

3. On the box, attach the new volume to the `rpool`.

   Example (as `root`)
   
    ```sh
    root@ip-172-31-37-147:~# format
    Searching for disks...done
    
    
    AVAILABLE DISK SELECTIONS:
          0. c1t0d0 <Xen-Virtual disk-1.0-8.00GB>
             /xpvd/xdf@51712
          1. c1t5d0 <Xen-Virtual disk-1.0 cyl 2086 alt 2 hd 255 sec 63>
             /xpvd/xdf@51792
    Specify disk (enter its number): ^C
    root@ip-172-31-37-147:~# zpool status
     pool: rpool
    state: ONLINE
    status: Some supported features are not enabled on the pool. The pool can
           still be used, but some features are unavailable.
    action: Enable all features using 'zpool upgrade'. Once this is done,
           the pool may no longer be accessible by software that does not support
           the features. See zpool-features(5) for details.
     scan: resilvered 1.05G in 0 days 00:00:28 with 0 errors on Fri Dec 13 13:05:12 2019
    config:
    
           NAME        STATE     READ WRITE CKSUM
           rpool       ONLINE       0     0     0
             c1t0d0    ONLINE       0     0     0
    
    errors: No known data errors
    root@ip-172-31-37-147:~# format
    Searching for disks...done
    
    
    AVAILABLE DISK SELECTIONS:
          0. c1t0d0 <Xen-Virtual disk-1.0-8.00GB>
             /xpvd/xdf@51712
          1. c1t5d0 <Xen-Virtual disk-1.0 cyl 2086 alt 2 hd 255 sec 63>
             /xpvd/xdf@51792
    Specify disk (enter its number): ^C
    root@ip-172-31-37-147:~# zpool attach rpool c1t0d0 c1t5d0
    Make sure to wait until resilver is done before rebooting.
    ```
    ...
    ```sh
    root@ip-172-31-37-147:~# zpool status
      pool: rpool
     state: ONLINE
    status: One or more devices is currently being resilvered.  The pool will
            continue to function, possibly in a degraded state.
    action: Wait for the resilver to complete.
      scan: resilver in progress since Sun Nov 22 00:51:10 2020
            2.43G scanned at 356M/s, 0 issued at 0/s, 6.06G total
            0 resilvered, 0.00% done, no estimated completion time
    config:
    
            NAME        STATE     READ WRITE CKSUM
            rpool       ONLINE       0     0     0
              mirror-0  ONLINE       0     0     0
                c1t0d0  ONLINE       0     0     0
                c1t5d0  ONLINE       0     0     0
    
    errors: No known data errors
    root@ip-172-31-37-147:~# 
    ```
    
    Detaching the original smaller volume TBD