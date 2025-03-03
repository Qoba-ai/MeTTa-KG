from pprint import pprint

from requests import request

from translations.src.json_to_metta import dict_list_to_metta

# get all users of page
# pprint(request("get", "https://deepfunding.ai/wp-json/deepfunding/v1/users?page=2").json())

class DFData:
    url = "https://deepfunding.ai/wp-json/deepfunding/v1"
    round_ids = None
    proposal_ids = None
    def get_with_pages(self, item_name: str, max_pages: int = 100, dict_key = None) -> list[dict[str, any]]:
        if not dict_key:
            dict_key = item_name
        page: int = 1
        items: list[dict[str, any]] = []
        for _ in range(max_pages):
            r: dict = request("get", f"{self.url}/{item_name}?page={page}").json()
            items += r[dict_key]
            page = r['pagination']['next_page']
            if not page:
                return items

    def get_all_users(self, max_pages = 100) -> list[dict[str, any]]:
        return self.get_with_pages("users", max_pages)

    def get_all_rounds(self) -> list[dict[str, any]]:
        r = request("get", f"{self.url}/rounds").json()
        self.round_ids = [k["id"] for k in r]
        return request("get", f"{self.url}/rounds").json()

    def get_all_pools(self) -> list[dict[str, any]]:
        return request("get", f"{self.url}/pools").json()

    def get_all_proposals(self) -> list[dict[str, any]]:
        if not self.round_ids:
            self.get_all_rounds()
        proposals = []
        for r_id in self.round_ids:
            props = request("get", f"{self.url}/rounds/{r_id}/proposals").json()["proposals"]
            for p in props:
                p["round_id"] = r_id
            # pprint(request("get", f"{self.url}/rounds/{r_id}/proposals").json()["proposals"])
            proposals += props
        self.proposal_ids = [p["id"] for p in proposals]
        return proposals

    # FIXME all id's, created_at and updated_at are empty
    def get_all_milestones(self, max_pages = 1000):
        return self.get_with_pages("milestones", max_pages)

    def get_all_milestones_(self):
        if not self.proposal_ids:
            self.get_all_proposals()
        milestones = []
        for p_id in self.proposal_ids:
            mss = request("get", f"{self.url}/proposals/{p_id}/milestones").json()["milestones"]
            for m in mss:
                m["round_id"] = p_id
            milestones += mss
        return milestones

    def get_all_reviews(self):
        pass

    def get_all_comments(self, max_pages = 100):
        return self.get_with_pages("comments", max_pages)

    def get_all_comment_votes(self, max_pages = 100):
        return self.get_with_pages("comment_votes", max_pages, "votes")

    def write_users(self, filename="data_users.metta", max_pages = 100):
        users = self.get_all_users(max_pages)
        # in MeTTa "id" is a built-in function
        for u in users:
            u["user_id"] = u.pop("id")

        with open(filename, "w") as f:
          dict_list_to_metta(f, users)

    def write_rounds(self, filename="data_rounds.metta") -> None:
        with open(filename, "w") as f:
            dict_list_to_metta(f, self.get_all_rounds())

    def write_pools(self, filename="data_pools.metta") -> None:
        with open(filename, "w") as f:
            dict_list_to_metta(f, self.get_all_pools())

    def write_proposals(self, filename="data_proposals.metta") -> None:
        with open(filename, "w") as f:
            dict_list_to_metta(f, self.get_all_proposals())

    def write_milestones(self, filename="data_milestones.metta") -> None:
        with open(filename, "w") as f:
            dict_list_to_metta(f, self.get_all_milestones())

    def write_comments(self, filename="data_comments.metta") -> None:
        with open(filename, "w") as f:
            comms: list[dict] = self.get_all_comments()
            dict_list_to_metta(f, comms)

    def write_comment_votes(self, filename="data_comment_votes.metta") -> None:
        with open(filename, "w") as f:
            dict_list_to_metta(f, self.get_all_comment_votes())

# users = get_all_users()
# with open("data_users.metta", "w") as f:
#     dict_list_to_metta(f, users)
# print(len(users))
# assert len(users) == 1760 # ??? I get 1739 users, while total_records = 1760?
# print(users)

# pprint(request("get", "https://deepfunding.ai/wp-json/deepfunding/v1/users?page=70").json())


# get all rounds
# pprint(request("get", "https://deepfunding.ai/wp-json/deepfunding/v1/rounds").json())


# with open("data_rounds.metta", "w") as f:
#     dict_list_to_metta(f, get_all_rounds())



# with open("data_pools.metta", "w") as f:
#     dict_list_to_metta(f, get_all_pools())


# pprint(request("get", "https://deepfunding.ai/wp-json/deepfunding/v1/rounds/36/proposals").json())


# get all comments of a specific user
# pprint(request("get", "https://deepfunding.ai/wp-json/deepfunding/v1/comments?user_id=539").json())



# get all votes on a specific comment
# pprint(request("get", "https://deepfunding.ai/wp-json/deepfunding/v1/comments/541/votes").json())

# get all round4 proposals
# pprint(request("get", "https://deepfunding.ai/wp-json/deepfunding/v1/rounds/36/proposals").json())

# get all comments on our proposal
# pprint(request("get", "https://deepfunding.ai/wp-json/deepfunding/v1/comments?proposal_id=5923").json())

# get our proposals milestones
# pprint(request("get", "https://deepfunding.ai/wp-json/deepfunding/v1/milestones?proposal_id=5923").json())

# get all reviews on our proposal
# pprint(request("get", "https://deepfunding.ai/wp-json/deepfunding/v1/proposals/5923/reviews").json())

# FIXME should work and do the same as the above, doesn't work
# pprint(request("get", "https://deepfunding.ai/wp-json/deepfunding/v1/reviews?proposal_id=5923").json())

# response = 500 ???
# pprint(request("get", "https://deepfunding.ai/wp-json/deepfunding/v1/reviews?reviewer_id=539"))


# pprint(request("get", "https://deepfunding.ai/wp-json/deepfunding/v1/comment_votes"))

def all_data_to_metta():
    df = DFData()
    df.write_users()
    # df.write_comments()
    # df.write_comment_votes()


if __name__ == '__main__':
    all_data_to_metta()
