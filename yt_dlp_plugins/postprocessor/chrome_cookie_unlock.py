import sys

import yt_dlp.cookies

from ctypes import WINFUNCTYPE, byref, create_unicode_buffer, pointer, windll
from ctypes.wintypes import DWORD, UINT, WCHAR

ERROR_SUCCESS = 0
ERROR_MORE_DATA = 234
RM_FORCE_SHUTDOWN = 1

original_open_database_copy = yt_dlp.cookies._open_database_copy


@WINFUNCTYPE(None, UINT)
def shutdown_callback(percent_complete: UINT) -> None:
    _ = percent_complete


restart_manager_library = windll.LoadLibrary("Rstrtmgr")


def unlock_cookies(cookies_path):
    session_handle = DWORD(0)
    session_flags = DWORD(0)
    session_key = (WCHAR * 256)()

    start_result = DWORD(
        restart_manager_library.RmStartSession(
            byref(session_handle),
            session_flags,
            session_key,
        )
    ).value

    if start_result != ERROR_SUCCESS:
        raise RuntimeError(f"RmStartSession returned non-zero result: {start_result}")

    try:
        register_result = DWORD(
            restart_manager_library.RmRegisterResources(
                session_handle,
                1,
                byref(pointer(create_unicode_buffer(cookies_path))),
                0,
                None,
                0,
                None,
            )
        ).value

        if register_result != ERROR_SUCCESS:
            raise RuntimeError(f"RmRegisterResources returned non-zero result: {register_result}")

        process_info_needed = DWORD(0)
        process_info = DWORD(0)
        reboot_reasons = DWORD(0)

        list_result = DWORD(
            restart_manager_library.RmGetList(
                session_handle,
                byref(process_info_needed),
                byref(process_info),
                None,
                byref(reboot_reasons),
            )
        ).value

        if list_result not in (ERROR_SUCCESS, ERROR_MORE_DATA):
            raise RuntimeError(f"RmGetList returned non-successful result: {list_result}")

        if process_info_needed.value:
            shutdown_result = DWORD(
                restart_manager_library.RmShutdown(
                    session_handle,
                    RM_FORCE_SHUTDOWN,
                    shutdown_callback,
                )
            ).value

            if shutdown_result != ERROR_SUCCESS:
                raise RuntimeError(f"RmShutdown returned non-successful result: {shutdown_result}")
    finally:
        end_result = DWORD(restart_manager_library.RmEndSession(session_handle)).value

        if end_result != ERROR_SUCCESS:
            raise RuntimeError(f"RmEndSession returned non-successful result: {end_result}")


def unlock_chrome(database_path, temp_directory):
    try:
        return original_open_database_copy(database_path, temp_directory)
    except PermissionError:
        print("Attempting to unlock cookies", file=sys.stderr)
        unlock_cookies(database_path)
        return original_open_database_copy(database_path, temp_directory)


yt_dlp.cookies._open_database_copy = unlock_chrome
