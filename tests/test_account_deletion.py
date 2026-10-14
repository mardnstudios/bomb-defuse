import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def extract_function(source: str, signature: str) -> str:
    start = source.index(signature)
    opening = source.index(") {", start) + 2
    depth = 0
    for index in range(opening, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[start:index + 1]
    raise AssertionError(f"Unterminated function: {signature}")


class TestAccountDeletion(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.js = (ROOT / "script.js").read_text(encoding="utf-8")
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.policy = (ROOT / "privacy-policy.html").read_text(encoding="utf-8")
        cls.flow = extract_function(cls.js, "async function deleteAccountDataSafely(")

    def run_scenarios(self):
        harness = f"""
const vm = require('node:vm');
const flowSource = {json.dumps(self.flow)};
const context = {{}};
vm.runInNewContext(flowSource + '; this.flow = deleteAccountDataSafely;', context);
const run = context.flow;
(async () => {{
  const output = {{}};

  output.success = await (async () => {{
    const calls = [];
    const result = await run({{
      user: {{ uid: 'uid-A' }},
      deleteCloudSave: async uid => (calls.push('cloud:' + uid), {{ status: 'SUCCESS' }}),
      deleteAuthAccount: async uid => (calls.push('auth:' + uid), {{ success: true }}),
      restoreCloudSave: async () => (calls.push('restore'), {{ status: 'SUCCESS' }}),
      resetLocal: async () => calls.push('reset'),
    }});
    return {{ result, calls }};
  }})();

  output.cloudFailure = await (async () => {{
    const calls = [];
    const result = await run({{
      user: {{ uid: 'uid-A' }},
      deleteCloudSave: async uid => (calls.push('cloud:' + uid), {{ status: 'ERROR' }}),
      deleteAuthAccount: async () => (calls.push('auth'), {{ success: true }}),
      restoreCloudSave: async () => (calls.push('restore'), {{ status: 'SUCCESS' }}),
      resetLocal: async () => calls.push('reset'),
    }});
    return {{ result, calls }};
  }})();

  output.authPartial = await (async () => {{
    const calls = [];
    const result = await run({{
      user: {{ uid: 'uid-A' }},
      deleteCloudSave: async uid => (calls.push('cloud:' + uid), {{ status: 'SUCCESS' }}),
      deleteAuthAccount: async uid => (calls.push('auth:' + uid), {{ success: false, reason: 'auth/requires-recent-login' }}),
      restoreCloudSave: async uid => (calls.push('restore:' + uid), {{ status: 'SUCCESS' }}),
      resetLocal: async () => calls.push('reset'),
    }});
    return {{ result, calls }};
  }})();

  output.partialRestoreFailure = await (async () => {{
    const calls = [];
    const result = await run({{
      user: {{ uid: 'uid-A' }},
      deleteCloudSave: async uid => (calls.push('cloud:' + uid), {{ status: 'SUCCESS' }}),
      deleteAuthAccount: async uid => (calls.push('auth:' + uid), {{ success: false, reason: 'NETWORK_ERROR' }}),
      restoreCloudSave: async uid => (calls.push('restore:' + uid), {{ status: 'ERROR' }}),
      resetLocal: async () => calls.push('reset'),
    }});
    return {{ result, calls }};
  }})();

  output.retry = await (async () => {{
    const calls = [];
    let authAttempt = 0;
    const dependencies = {{
      user: {{ uid: 'uid-A' }},
      deleteCloudSave: async uid => (calls.push('cloud:' + uid), {{ status: 'SUCCESS' }}),
      deleteAuthAccount: async uid => {{
        calls.push('auth:' + uid);
        authAttempt += 1;
        return authAttempt === 1
          ? {{ success: false, reason: 'auth/requires-recent-login' }}
          : {{ success: true }};
      }},
      restoreCloudSave: async uid => (calls.push('restore:' + uid), {{ status: 'SUCCESS' }}),
      resetLocal: async () => calls.push('reset'),
    }};
    const first = await run(dependencies);
    const second = await run(dependencies);
    return {{ first, second, calls }};
  }})();

  process.stdout.write(JSON.stringify(output));
}})().catch(error => {{ console.error(error); process.exit(1); }});
"""
        completed = subprocess.run(
            ["node", "-e", harness],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        )
        return json.loads(completed.stdout)

    def test_success_deletes_only_after_cloud_then_auth_and_resets_local_last(self):
        result = self.run_scenarios()["success"]
        self.assertTrue(result["result"]["success"])
        self.assertEqual(result["calls"], ["cloud:uid-A", "auth:uid-A", "reset"])

    def test_cloud_deletion_failure_keeps_auth_and_local_data(self):
        result = self.run_scenarios()["cloudFailure"]
        self.assertFalse(result["result"]["success"])
        self.assertEqual(result["result"]["stage"], "cloud_delete")
        self.assertEqual(result["calls"], ["cloud:uid-A"])

    def test_auth_failure_restores_cloud_and_keeps_local_data_for_reauthentication(self):
        result = self.run_scenarios()["authPartial"]
        self.assertFalse(result["result"]["success"])
        self.assertEqual(result["result"]["stage"], "auth_delete")
        self.assertTrue(result["result"]["cloudSaveRestored"])
        self.assertIn("recent sign-in", result["result"]["message"])
        self.assertEqual(result["calls"], ["cloud:uid-A", "auth:uid-A", "restore:uid-A"])

    def test_partial_restore_failure_keeps_local_data_and_reports_incomplete_state(self):
        result = self.run_scenarios()["partialRestoreFailure"]
        self.assertFalse(result["result"]["success"])
        self.assertTrue(result["result"]["cloudSaveDeleted"])
        self.assertFalse(result["result"]["cloudSaveRestored"])
        self.assertNotIn("reset", result["calls"])

    def test_retry_repeats_idempotent_owner_delete_then_completes(self):
        result = self.run_scenarios()["retry"]
        self.assertFalse(result["first"]["success"])
        self.assertTrue(result["second"]["success"])
        self.assertEqual(result["calls"].count("cloud:uid-A"), 2)
        self.assertEqual(result["calls"].count("reset"), 1)

    def test_only_authenticated_uid_document_is_deleted_and_ui_keeps_retry_path(self):
        self.assertIn('await db.collection("users").doc(user.uid).delete();', self.js)
        self.assertIn("user.uid !== expectedUid", self.js)
        self.assertIn("FirebaseManager.getCurrentUser()", self.js)
        self.assertIn("if (registeredProfile && !firebaseUser?.uid)", self.js)
        self.assertIn("if (el.btnCancelDeleteAccount) el.btnCancelDeleteAccount.disabled = false;", self.js)
        self.assertIn("if (!result?.success)", self.js)
        self.assertIn("if (deletingUid === user.uid && !allowDeletionRestore)", self.js)
        self.assertIn("CloudSaveManager.beginAccountDeletion(deletionUser.uid)", self.js)
        self.assertIn("CloudSaveManager.endAccountDeletion(deletionLockUid)", self.js)
        self.assertIn("CloudSaveManager.uploadSave(localSnapshot, uid, true)", self.js)
        self.assertIn("function enqueueCloudWrite(operation)", self.js)
        self.assertIn("return enqueueCloudWrite(async () => {", self.js)
        self.assertIn("await deleteCloudSave(user.uid);", self.flow)
        self.assertIn("await deleteAuthAccount(user.uid);", self.flow)
        self.assertIn("await restoreCloudSave(user.uid);", self.flow)
        self.assertIn("users/{authenticated Firebase UID}", self.policy)
        self.assertIn("then request Firebase account deletion.", self.html)
        self.assertIn("Local data is reset only after both steps succeed.", self.html)


if __name__ == "__main__":
    unittest.main()
