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
